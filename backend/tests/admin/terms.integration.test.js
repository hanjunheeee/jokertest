'use strict';

// 약관 버전 통합 시험 (AD-240·241·242), 진짜 시험 DB + 관리자 경로 + 기존 플레이어 재동의 서비스
// npm run test:with-db -- tests/admin/terms.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

let dbHandle = null;
let app = null;
test.before(async () => {
    dbHandle = await prepareAdminDb();
    if (dbHandle) app = await adminTestApp();
});
test.after(async () => {
    if (app) await app.close();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const playerTerms = require('../../services/auth/terms');

const HOUR = 60 * 60 * 1000;

const makeUser = async () => {
    const uuid = crypto.randomUUID();
    await db().User.create({ uuid, password_hash: 'x', nickname: `t${uuid.slice(0, 7)}`, email: `t-${uuid}@example.com` });
    return uuid;
};

// 지금 약관 전부 동의한 플레이어
const agreedPlayer = async () => {
    const uuid = await makeUser();
    const current = await playerTerms.getPendingTerms(uuid);
    await playerTerms.agreeToTerms(uuid, current.map((terms) => terms.id));
    assert.deepEqual(await playerTerms.getPendingTerms(uuid), []);
    return uuid;
};

let serial = 0;
const newTermsBody = (extra = {}) => ({
    kind: 'TERMS',
    version: `2.${Date.now()}.${(serial += 1)}`,
    title: '이용약관 개정',
    body: '새 본문',
    url: null,
    effectiveAt: new Date(Date.now() + HOUR).toISOString(),
    isRequired: true,
    ...extra,
});

test('AD-240: 새 버전 저장 + 기록 → 시행 전엔 그대로, 시행 뒤 플레이어 /user/me/terms에 다시 동의할 것으로 나옴', async (t) => {
    if (skipWithoutDb(t)) return;
    const player = await agreedPlayer();
    const body = newTermsBody();
    const res = await app.agent.post('/admin-api/terms', body);
    assert.equal(res.status, 201);
    const { terms } = res.body;
    assert.equal(terms.version, body.version);
    assert.equal(terms.effectiveAt, body.effectiveAt);
    assert.equal(terms.agreedCount, 0);

    const row = await db().TermsVersion.findByPk(terms.id);
    assert.equal(row.created_by_admin_id, app.admin.id);
    const log = await db().AdminAuditLog.findOne({ where: { action: 'TERMS_CREATE', target_id: String(terms.id) } });
    assert.ok(log, 'TERMS_CREATE 기록 있음');
    assert.equal(log.admin_id, app.admin.id);
    assert.equal(log.after_value.version, body.version);

    assert.deepEqual(await playerTerms.getPendingTerms(player), []);
    const later = await playerTerms.getPendingTerms(player, { now: new Date(Date.now() + 2 * HOUR) });
    assert.deepEqual(later.map((item) => item.id), [terms.id]);
});

test('AD-241: 같은 종류·버전 409, 시행일 과거 400, 본문·주소 둘 다 없음 400, 이상한 주소·모르는 칸 400', async (t) => {
    if (skipWithoutDb(t)) return;
    const body = newTermsBody({ kind: 'PRIVACY' });
    assert.equal((await app.agent.post('/admin-api/terms', body)).status, 201);
    const again = await app.agent.post('/admin-api/terms', { ...body, title: '다른 제목' });
    assert.deepEqual([again.status, again.body.code], [409, 'TERMS_VERSION_EXISTS']);

    const cases = [
        [{ effectiveAt: new Date(Date.now() - HOUR).toISOString() }, 'INVALID_TERMS', 'effectiveAt'],
        [{ body: null, url: null }, 'INVALID_TERMS', 'body'],
        [{ body: '', url: '' }, 'INVALID_TERMS', 'body'],
        [{ url: 'javascript:alert(1)' }, 'INVALID_TERMS', 'url'],
        [{ kind: 'OTHER' }, 'INVALID_TERMS', 'kind'],
        [{ effectiveAt: '내일' }, 'INVALID_TERMS', 'effectiveAt'],
        [{ admin: 'x' }, 'INVALID_INPUT', 'admin'],
    ];
    for (const [extra, code, field] of cases) {
        const res = await app.agent.post('/admin-api/terms', newTermsBody(extra));
        assert.deepEqual([res.status, res.body.code, res.body.field], [400, code, field], JSON.stringify(extra));
    }
    // 주소만 있어도 됨
    const urlOnly = await app.agent.post('/admin-api/terms', newTermsBody({ body: null, url: 'https://example.com/terms' }));
    assert.equal(urlOnly.status, 201);
});

test('AD-242: 버전별 동의 수 + 지금 시행 중 표시', async (t) => {
    if (skipWithoutDb(t)) return;
    const before = await app.agent.get('/admin-api/terms');
    assert.equal(before.status, 200);
    const currentBefore = before.body.items.filter((item) => item.isCurrent);
    assert.deepEqual(currentBefore.map((item) => item.kind).sort(), ['PRIVACY', 'TERMS']);

    await agreedPlayer();
    await agreedPlayer();
    const after = await app.agent.get('/admin-api/terms');
    for (const item of currentBefore) {
        const now = after.body.items.find((line) => line.id === item.id);
        assert.equal(now.agreedCount, item.agreedCount + 2, `${item.kind} 동의 수 2 늘어남`);
    }
    // 아직 시행 전 버전은 지금 버전 아님 · 동의 0
    const future = after.body.items.filter((item) => Date.parse(item.effectiveAt) > Date.now());
    assert.ok(future.length > 0);
    assert.ok(future.every((item) => !item.isCurrent && item.agreedCount === 0));
});
