'use strict';

// 관리자 보상 지급 시험: 진짜 경로(POST /economy/admin/grant)에 계정 역할·운영 여부·몸을 바꿔 보내고 지급·거절을 지갑·장부로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-252~258 (돌리기: node --env-file=.env.test --test tests/flow/a12-admin-grant.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 서버 + 받는 사람 하나 (있는 계정), 보내는 사람 역할은 시험마다
const setup = async (t, role) => {
    const base = await w.startApp(t);
    const target = w.uid('a12-grant-target');
    const { db } = w.economyDb(t, { knownUsers: new Set([target]) });
    const actor = w.uid(`a12-grant-${role.toLowerCase()}`);
    const cookie = w.login(actor, { role });
    const grant = (body) => w.call(base, 'POST', '/economy/admin/grant', { cookie, body });
    const goldOf = (uuid) => db._inspect.wallets.get(uuid)?.balance_gold ?? 0;
    return { db, target, grant, goldOf };
};

// 보상 표에 있는 사유 (골드 1000)
const body = (target, extra = {}) => ({ userId: target, reason: 'EVENT_COMPENSATION_GOLD', referenceEventId: `grant-${target}`, ...extra });

// 거절: 상태·코드, 지갑·장부 그대로
const assertRefused = async (c, sent, status, code) => {
    const before = w.economyState(c.db);
    const res = await c.grant(sent);
    assert.equal(res.status, status, JSON.stringify(res.body));
    if (code) assert.equal(res.body.code, code);
    assert.equal(w.economyState(c.db), before, '지갑·장부가 바뀜');
};

// 지급됨: 201, 받는 사람 골드 +1000, 장부 1줄
const assertGranted = async (c, sent) => {
    const res = await c.grant(sent);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(c.goldOf(c.target), 1_000);
    assert.equal(c.db._inspect.ledgerEntries.filter((row) => row.user_id === c.target).length, 1);
};

test('A12-B-252 일반 계정 → 403 ECONOMY_ADMIN_ONLY', async (t) => {
    const c = await setup(t, 'USER');
    await assertRefused(c, body(c.target), 403, 'ECONOMY_ADMIN_ONLY');
});

test('A12-B-253 QA 계정(운영 아님) → 지급', async (t) => {
    w.withEnv(t, { NODE_ENV: 'development' });
    const c = await setup(t, 'QA');
    await assertGranted(c, body(c.target));
});

test('A12-B-254 QA 계정(운영) → 403', async (t) => {
    w.withEnv(t, { NODE_ENV: 'production' });
    const c = await setup(t, 'QA');
    await assertRefused(c, body(c.target), 403, null);
});

test('A12-B-255 ADMIN → 지급', async (t) => {
    const c = await setup(t, 'ADMIN');
    await assertGranted(c, body(c.target));
});

test('A12-B-256 모르는 사유 → 400 UNKNOWN_REWARD_REASON', async (t) => {
    const c = await setup(t, 'ADMIN');
    await assertRefused(c, body(c.target, { reason: 'FREE_MONEY' }), 400, 'UNKNOWN_REWARD_REASON');
});

test('A12-B-257 몸에 amount → 400 (금액은 몸으로 못 정함)', async (t) => {
    const c = await setup(t, 'ADMIN');
    await assertRefused(c, body(c.target, { amount: 999_999 }), 400, null);
});

test('A12-B-258 없는 계정 → 404', async (t) => {
    const c = await setup(t, 'ADMIN');
    await assertRefused(c, body(w.uid('a12-grant-nobody')), 404, null);
});
