'use strict';

// 2026-11-09 재화·친구 신청 버그 수정 시험 (DB 안 씀)
// 관리자 지급 없는 계정 404 · QA 지급 운영 막기 · 구매 참조 id 길이 · 친구 신청 속도 제한 · 입장 거절 코드
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test   = require('node:test');
const assert = require('node:assert/strict');

const economyService = require('../../services/economy');
const userService    = require('../../services/user');
const purchase       = require('../../controllers/economy/purchase');
const { requireEconomyAdmin } = require('../../middlewares/economyAccess.middleware');

// 처리기 한 번 부르고 응답 또는 next로 온 오류
const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'me' }, params: {}, ...req }, res, (error) => resolve({ error })));
});

const replace = (t, obj, name, impl) => {
    const original = obj[name];
    obj[name] = impl;
    t.after(() => { obj[name] = original; });
};

test('BE-062: 관리자 지급 대상 계정이 없으면(외래 키 오류) 500이 아니라 404 GRANT_TARGET_NOT_FOUND', async (t) => {
    replace(t, economyService, 'grantReward', async () => {
        throw Object.assign(new Error('Cannot add or update a child row: a foreign key constraint fails'), { name: 'SequelizeForeignKeyConstraintError' });
    });
    const result = await call(purchase.grantReward, { body: { userId: 'ghost', reason: 'QA_TEST_GRANT_GOLD', referenceEventId: 'r' } });
    assert.equal(result.error.status, 404);
    assert.equal(result.error.code, 'GRANT_TARGET_NOT_FOUND');
});

test('BE-062: 운영에서는 QA 역할도 관리자 지급을 못 함 (ADMIN만), 개발·시험에선 QA 통과', async (t) => {
    replace(t, userService, 'findByUuid', async () => ({ uuid: 'me', role: 'QA' }));
    const saved = process.env.NODE_ENV;
    t.after(() => { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; });

    process.env.NODE_ENV = 'production';
    let passedError = 'not-called';
    await requireEconomyAdmin({ user: { uuid: 'me' } }, {}, (error) => { passedError = error; });
    assert.equal(passedError?.code, 'ECONOMY_ADMIN_ONLY');

    process.env.NODE_ENV = 'test';
    await requireEconomyAdmin({ user: { uuid: 'me' } }, {}, (error) => { passedError = error; });
    assert.equal(passedError, undefined);
});

test('BE-061: 단건·묶음 구매 참조 id가 120자를 넘으면 서비스 가기 전에 400 (장부 칸 150자 넘는 저장 실패 막기)', async (t) => {
    let serviceCalls = 0;
    replace(t, economyService, 'purchaseItem', async () => { serviceCalls += 1; return {}; });
    replace(t, economyService, 'purchaseItems', async () => { serviceCalls += 1; return {}; });

    const single = await call(purchase.purchaseItem, { body: { itemId: 'x', referenceEventId: 'r'.repeat(121) } });
    assert.equal(single.error.status, 400);
    const bulk = await call(purchase.purchaseItems, { body: { items: [{ itemId: 'x' }], referenceEventId: 'r'.repeat(121) } });
    assert.equal(bulk.error.status, 400);
    assert.equal(serviceCalls, 0);
});

test('BE-061: 서비스도 120자 넘는 참조 id는 DB 가기 전에 400 REFERENCE_EVENT_ID_TOO_LONG', async () => {
    await assert.rejects(
        economyService.purchaseItems({ userId: 'u', items: [{ itemId: 'x' }], referenceEventId: 'r'.repeat(121) }, {}),
        (error) => error.status === 400 && error.code === 'REFERENCE_EVENT_ID_TOO_LONG',
    );
});

test('BE-063: 친구 신청은 계정마다 10분 20번까지, 넘으면 429와 문구', async () => {
    const router = require('../../routes/friend.routes');
    const layer = router.stack.find((entry) => entry.route?.path === '/requests' && entry.route.methods.post);
    const limiter = layer.route.stack[1].handle;

    const run = (uuid) => {
        let passed = false;
        const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        limiter({ user: { uuid } }, res, () => { passed = true; });
        return { passed, res };
    };
    for (let i = 0; i < 20; i += 1) assert.equal(run('spammer').passed, true);
    const blocked = run('spammer');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.match(blocked.res.body.message, /친구 신청이 너무 많습니다/);
    assert.equal(run('someone-else').passed, true, '다른 계정은 따로 셈');
});

test('대기방 입장 시도 제한 코드 TOO_MANY_JOIN_ATTEMPTS가 입장 거절 코드 표에 있다', () => {
    const { ROOM_JOIN_ERROR_CODES } = require('../../socket/roomJoinErrors');
    assert.equal(ROOM_JOIN_ERROR_CODES.TOO_MANY_JOIN_ATTEMPTS, 'TOO_MANY_JOIN_ATTEMPTS');
});
