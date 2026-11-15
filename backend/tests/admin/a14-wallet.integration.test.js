'use strict';

// 관리자 재화 주고 뺏기 시험: 장부 사유·참조·잔액 경계·같은 요청 번호·10억 넘김·몸 검사, 끝마다 지갑 = 장부 합 (진짜 관리자 경로 + 시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-269~276 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');
const money = require('./helpers/money');

const ctx = H.useAdminFile();

const adjust = (uuid, body) => ctx.app.agent.post(`/admin-api/members/${uuid}/wallet/adjust`, body);
const grant = (overrides = {}) => ({ requestId: crypto.randomUUID(), currency: 'GOLD', amount: 300, reason: '이벤트 보상', ...overrides });

test('A14-B-269 골드 +300 → 장부 ADMIN_GRANT·참조 admin:<요청 번호>, 지갑 = 장부 합, 기록 WALLET_ADJUST 사유', async (t) => {
    if (H.noDb(t)) return;
    const { uuid } = await H.createPlayer('w269');
    const body = grant();
    const res = await adjust(uuid, body);
    assert.equal(res.status, 200);
    const { wallet, entries } = await money.assertWalletMatchesLedger(uuid);
    assert.equal(wallet.gold, 300);
    const entry = entries.find((e) => e.reason === 'ADMIN_GRANT');
    assert.ok(entry, '주기 장부 줄');
    assert.equal(Number(entry.amount), 300);
    assert.equal(entry.reference_event_id, `admin:${body.requestId}`);
    const audits = await H.myAudits(ctx.app.admin, { action: 'WALLET_ADJUST', targetId: uuid });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].reason, '이벤트 보상');
});

// A14-B-270~271 잔액 100에서 뺏기 경계 (값 2)
const REVOKE_EDGES = [
    ['270', -100, true],
    ['271', -101, false],
];
for (const [no, amount, ok] of REVOKE_EDGES) {
    test(`A14-B-${no} 잔액 100에서 ${amount} → ${ok ? '잔액 0, 장부 ADMIN_REVOKE 음수' : '409 BALANCE_SHORT, 지갑·장부 그대로'}`, async (t) => {
        if (H.noDb(t)) return;
        const { uuid } = await H.createPlayer(`w${no}`);
        await money.fund(uuid, 'GOLD', 100);
        const ledgerBefore = (await money.ledgerOf(uuid)).length;
        const res = await adjust(uuid, grant({ amount }));
        const { wallet, entries } = await money.assertWalletMatchesLedger(uuid);
        if (ok) {
            assert.equal(res.status, 200);
            assert.equal(wallet.gold, 0);
            const revoke = entries.find((e) => e.reason === 'ADMIN_REVOKE');
            assert.ok(revoke, '뺏기 장부 줄');
            assert.equal(Number(revoke.amount), -100);
        } else {
            assert.equal(res.status, 409);
            assert.equal(res.body.code, 'BALANCE_SHORT');
            assert.equal(wallet.gold, 100);
            assert.equal(entries.length, ledgerBefore);
        }
    });
}

test('A14-B-272 같은 요청 번호·같은 내용 두 번 → 장부 1줄, 두 번째는 처음 결과', async (t) => {
    if (H.noDb(t)) return;
    const { uuid } = await H.createPlayer('w272');
    const body = grant({ amount: 50 });
    const first = await adjust(uuid, body);
    const second = await adjust(uuid, body);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.ledgerEntry.id, first.body.ledgerEntry.id);
    assert.equal(second.body.balance, first.body.balance);
    const { wallet, entries } = await money.assertWalletMatchesLedger(uuid);
    assert.equal(entries.filter((e) => e.reference_event_id === `admin:${body.requestId}`).length, 1);
    assert.equal(wallet.gold, 50);
});

test('A14-B-273 같은 요청 번호·다른 금액 → 409 REFERENCE_EVENT_CONFLICT, 지갑 그대로', async (t) => {
    if (H.noDb(t)) return;
    const { uuid } = await H.createPlayer('w273');
    const body = grant({ amount: 50 });
    assert.equal((await adjust(uuid, body)).status, 200);
    const res = await adjust(uuid, { ...body, amount: 70 });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'REFERENCE_EVENT_CONFLICT');
    const { wallet } = await money.assertWalletMatchesLedger(uuid);
    assert.equal(wallet.gold, 50);
});

test('A14-B-274 잔액 999,999,999에 +2 → 거절, 지갑·장부 그대로', async (t) => {
    if (H.noDb(t)) return;
    const { uuid } = await H.createPlayer('w274');
    await money.fund(uuid, 'GOLD', 999_999_999);
    const ledgerBefore = (await money.ledgerOf(uuid)).length;
    const res = await adjust(uuid, grant({ amount: 2 }));
    assert.ok(res.status >= 400 && res.status < 500, `거절 상태 ${res.status} ${res.body?.code}`);
    const { wallet, entries } = await money.assertWalletMatchesLedger(uuid);
    assert.equal(wallet.gold, 999_999_999);
    assert.equal(entries.length, ledgerBefore);
});

// A14-B-275~276 몸 검사 (값 2)
const BODY_CASES = [
    ['275', '금액 0', { amount: 0 }, 'amount', 'INVALID_INPUT'],
    ['276', '사유 빔', { reason: '   ' }, 'reason', 'REASON_REQUIRED'],
];
for (const [no, label, overrides, field, code] of BODY_CASES) {
    test(`A14-B-${no} ${label} → 400 ${code} field ${field}, 장부 그대로`, async (t) => {
        if (H.noDb(t)) return;
        const { uuid } = await H.createPlayer(`w${no}`);
        const res = await adjust(uuid, grant(overrides));
        H.assertInvalid(res, field, code);
        assert.equal((await money.ledgerOf(uuid)).filter((e) => e.reason.startsWith('ADMIN_')).length, 0);
    });
}
