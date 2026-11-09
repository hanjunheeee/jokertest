'use strict';

// 금지어 통합 시험 (AD-170·171·172), 진짜 시험 DB + 관리자 라우터 + 이 Node 다시 읽기
// npm run test:with-db -- tests/admin/bannedWords.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => {
    require('../../services/ops/reloadSync').__testables.stopSafetyNet();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const bannedWords = require('../../services/ops/bannedWords');
const userService = require('../../services/user');

// 시험마다 겹치지 않는 단어 (예: '금ab12', 닉네임 8자 안에 들게 짧게)
const newWord = () => `금${crypto.randomBytes(2).toString('hex')}`;
const logsOf = (action, targetId) => db().AdminAuditLog.findAll({ where: { action, target_id: String(targetId) }, raw: true });

test('AD-170: 넣기 → 표·전 Node 다시 읽기·기록, 채팅 가림, 닉네임 400 NICKNAME_BANNED_WORD', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const word = newWord();

    const res = await agent.post('/admin-api/banned-words', { word: `  ${word.toUpperCase()} ` });

    assert.equal(res.status, 201);
    assert.equal(res.body.word.word, word);
    assert.equal(res.body.word.isActive, true);
    assert.equal(res.body.partial, false);
    assert.equal(res.body.nodes.length, 1);
    assert.equal(res.body.nodes[0].ok, true);
    const row = await db().BannedWord.findOne({ where: { word }, raw: true });
    assert.equal(Boolean(row.is_active), true);
    assert.equal(row.created_by_admin_id, admin.id);
    const logs = await logsOf('BANNED_WORD_ADD', row.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].admin_id, admin.id);

    // 이 Node가 바로 다시 읽음 → 채팅 가림·닉네임 막힘
    assert.equal(bannedWords.maskBannedWords(`야 ${word}!`), `야 ${'*'.repeat(word.length)}!`);
    const user = await db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `bw${crypto.randomBytes(3).toString('hex')}`, email: `bw${Date.now()}@example.com` });
    const changed = await userService.changeNickname(user.uuid, `a${word}`);
    assert.equal(changed.status, 400);
    assert.equal(changed.code, 'NICKNAME_BANNED_WORD');

    // 목록에 보임 (새 것 먼저, 찾기)
    const list = await agent.get(`/admin-api/banned-words?q=${encodeURIComponent(word)}`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items.map((item) => item.word), [word]);
    assert.equal(list.body.nextBefore, null);
});

test('AD-171: 이미 있음 → 409 BANNED_WORD_EXISTS (꺼진 것이면 id·isActive false 같이)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const word = newWord();
    const first = await agent.post('/admin-api/banned-words', { word });
    assert.equal(first.status, 201);

    const again = await agent.post('/admin-api/banned-words', { word });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'BANNED_WORD_EXISTS');
    assert.equal(again.body.id, first.body.word.id);
    assert.equal(again.body.isActive, true);

    await agent.request('PATCH', `/admin-api/banned-words/${first.body.word.id}`, { body: { isActive: false } });
    const offAgain = await agent.post('/admin-api/banned-words', { word });
    assert.equal(offAgain.status, 409);
    assert.equal(offAgain.body.id, first.body.word.id);
    assert.equal(offAgain.body.isActive, false);
    assert.equal((await db().BannedWord.count({ where: { word } })), 1);
});

test('AD-172: 끄기 → 다시 안 가림, 켜면 다시 가림, 기록 전후 값, 없는 id 404', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const word = newWord();
    const added = await agent.post('/admin-api/banned-words', { word });
    const { id } = added.body.word;
    assert.notEqual(bannedWords.maskBannedWords(word), word);

    const off = await agent.request('PATCH', `/admin-api/banned-words/${id}`, { body: { isActive: false } });
    assert.equal(off.status, 200);
    assert.equal(off.body.word.isActive, false);
    assert.equal(off.body.partial, false);
    assert.equal(bannedWords.maskBannedWords(word), word);

    const on = await agent.request('PATCH', `/admin-api/banned-words/${id}`, { body: { isActive: true } });
    assert.equal(on.body.word.isActive, true);
    assert.notEqual(bannedWords.maskBannedWords(word), word);

    const logs = await logsOf('BANNED_WORD_TOGGLE', id);
    assert.equal(logs.length, 2);
    const turnedOff = logs.find((log) => (typeof log.after_value === 'string' ? JSON.parse(log.after_value) : log.after_value).isActive === false);
    assert.ok(turnedOff);

    const missing = await agent.request('PATCH', '/admin-api/banned-words/999999999', { body: { isActive: false } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'BANNED_WORD_NOT_FOUND');
});
