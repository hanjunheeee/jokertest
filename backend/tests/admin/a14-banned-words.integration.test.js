'use strict';

// 관리자 금지어 시험: 넣기(서버별 반영·기록)·넣은 뒤 판 채팅 가림·닉네임 막힘·이미 있음·끄기·단어 길이 (진짜 관리자 경로 + 시험 DB + 메모리 판)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-231~238 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

// 모델을 먼저 불러 시험 DB에 붙여 둠 (gameFixtures가 DB 주소를 막는 값으로 바꾸기 전에)
const H = require('./a14-ops-helpers');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');
const bannedWords = require('../../services/ops/bannedWords');
const userService = require('../../services/user');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { db } = H;
const T = gs.__testables;
const ctx = H.useAdminFile();

// 시험마다 안 겹치는 단어 (소문자, 이 시험만의 머리글자)
const wordOf = () => `qz${H.tag()}`;
const add = (word) => ctx.app.agent.post('/admin-api/banned-words', { word });
const toggle = (id, isActive) => ctx.app.agent.request('PATCH', `/admin-api/banned-words/${id}`, { body: { isActive } });

// 이 시험이 넣은 단어는 끝에 지우고 이 서버 목록도 다시 읽음 (금지어는 공용 설정 줄)
function cleanupWords(t, words) {
    t.after(async () => {
        await db.BannedWord.destroy({ where: { word: words } });
        await bannedWords.reloadBannedWords();
    });
}

// 6명 판 낮 → 한 사람이 채팅 → 다른 사람이 받은 글
async function dayChatSeenByOther(t, id, text) {
    gf.resetCore();
    const session = gf.startGame({ id, n: 6 });
    gf.toDay(session);
    const world = gf.socketWorld(gs, session);
    t.after(() => { gf.resetCore(); chatBuffer.__resetForTests(); });
    const [speaker, listener] = gf.nonJokers(session);
    const reply = await gf.call(T.handleSubmitGameChatMessage, world.io, world.sock(speaker), speaker, { gameId: session.id, text });
    assert.equal(reply.ok, true, `채팅 거절 ${reply.code}`);
    const got = world.received(listener, 'day_chat_message_received').map((e) => e.payload.text);
    assert.equal(got.length, 1);
    return got[0];
}

test('A14-B-231 POST { word } → 201, 표 1줄, nodes(서버별 반영), 기록 BANNED_WORD_ADD', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf();
    cleanupWords(t, [word]);
    const res = await add(word);
    assert.equal(res.status, 201);
    assert.ok(Array.isArray(res.body.nodes) && res.body.nodes.length >= 1, 'nodes 있음');
    assert.equal(res.body.nodes.every((n) => n.ok === true), true);
    const rows = await db.BannedWord.findAll({ where: { word }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'BANNED_WORD_ADD', targetId: rows[0].id })).length, 1);
});

// A14-B-232~233 넣은 뒤 게임에서 막힘 (값 2)
test('A14-B-232 넣은 뒤 6명 판 낮 채팅에 그 단어 → 받는 사람 화면 값이 같은 길이 *', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf();
    cleanupWords(t, [word]);
    assert.equal((await add(word)).status, 201);
    const seen = await dayChatSeenByOther(t, 'a14bw232', `안녕 ${word} 끝`);
    assert.equal(seen, `안녕 ${'*'.repeat(word.length)} 끝`);
});

test('A14-B-233 넣은 뒤 닉네임 바꾸기에 그 단어 → 400 NICKNAME_BANNED_WORD', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf().slice(0, 6);
    cleanupWords(t, [word]);
    assert.equal((await add(word)).status, 201);
    const player = await H.createPlayer('b233');
    const result = await userService.changeNickname(player.uuid, `가${word}`);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.code, 'NICKNAME_BANNED_WORD');
    assert.equal((await db.User.findByPk(player.uuid, { raw: true })).nickname, player.nickname);
});

// A14-B-234~235 이미 있음 (값 2)
test('A14-B-234 켜진 단어 다시 넣기 → 409 BANNED_WORD_EXISTS, 줄 1개 그대로', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf();
    cleanupWords(t, [word]);
    assert.equal((await add(word)).status, 201);
    const res = await add(word);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'BANNED_WORD_EXISTS');
    assert.equal(await db.BannedWord.count({ where: { word } }), 1);
});

test('A14-B-235 꺼진 단어 다시 넣기 → 409 + 그 줄 id·isActive false', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf();
    cleanupWords(t, [word]);
    const made = await add(word);
    const { id } = made.body.word;
    assert.equal((await toggle(id, false)).status, 200);
    const res = await add(word);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'BANNED_WORD_EXISTS');
    assert.equal(res.body.id, id);
    assert.equal(res.body.isActive, false);
});

test('A14-B-236 PATCH isActive false → 그 단어 채팅에 그대로 보임, 기록 BANNED_WORD_TOGGLE', async (t) => {
    if (H.noDb(t)) return;
    const word = wordOf();
    cleanupWords(t, [word]);
    const made = await add(word);
    const { id } = made.body.word;
    const off = await toggle(id, false);
    assert.equal(off.status, 200);
    const seen = await dayChatSeenByOther(t, 'a14bw236', `안녕 ${word} 끝`);
    assert.equal(seen, `안녕 ${word} 끝`);
    const audits = await H.myAudits(ctx.app.admin, { action: 'BANNED_WORD_TOGGLE', targetId: id });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].after_value.isActive, false);
});

// A14-B-237~238 단어 길이 (값 2)
test('A14-B-237 빈 글 → 400 field word, 표 그대로', async (t) => {
    if (H.noDb(t)) return;
    const before = await db.BannedWord.count();
    H.assertInvalid(await add(''), 'word');
    assert.equal(await db.BannedWord.count(), before);
});

test('A14-B-238 101자 → 400 field word, 100자 → 201', async (t) => {
    if (H.noDb(t)) return;
    const head = wordOf();
    const fit = `${head}${'k'.repeat(100 - head.length)}`;
    const long = `${fit}k`;
    cleanupWords(t, [fit, long]);
    H.assertInvalid(await add(long), 'word');
    assert.equal(await db.BannedWord.count({ where: { word: long } }), 0);
    assert.equal((await add(fit)).status, 201);
    assert.equal(await db.BannedWord.count({ where: { word: fit } }), 1);
});
