'use strict';

// 장부 금액·통화·같은 참조 번호 검사 시험: 장부 거래 함수에 값 넣고 돌려준 값·거절·지갑·장부를 가짜 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-001~021 (돌리기: node --env-file=.env.test --test tests/unit/a12-amount-check.test.js)

// 모델이 진짜 DB에 못 붙게 (장부 함수가 기본 DB를 부르는 일 막기)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyLedgerTransaction } = require('../../services/economy/ledger');
const { createFakeEconomyDb, seedWallet } = require('../audit-2026-11-09/fakeEconomyDb');

const MAX = 1_000_000_000;

// 거절 모양: 400 + 코드
const assertRejected = async (promise, status, code) => {
    await assert.rejects(promise, (error) => {
        assert.equal(error.status, status, `상태 ${error.status}`);
        assert.equal(error.code, code);
        return true;
    });
};

// 장부 한 줄 요청 (사유·통화·금액만 바꿔 씀)
const entry = (overrides = {}) => ({
    userId: 'a12-amount-u1', reason: 'REWARD', currency: 'GOLD', amount: 10, referenceEventId: 'a12-ref-1', ...overrides,
});

// ── A12-B-001~006: 정수 아닌 금액은 장부에 못 들어감, 지갑 안 건드림 ──

const BAD_AMOUNTS = [
    ['A12-B-001', '1.5', 1.5],
    ['A12-B-002', '"1"(글자)', '1'],
    ['A12-B-003', 'NaN', Number.NaN],
    ['A12-B-004', 'Infinity', Number.POSITIVE_INFINITY],
    ['A12-B-005', 'null', null],
    ['A12-B-006', '2^53', 2 ** 53],
];
for (const [id, label, amount] of BAD_AMOUNTS) {
    test(`${id} 금액 ${label} → 400 AMOUNT_OUT_OF_RANGE, 지갑·장부 안 건드림`, async () => {
        const db = createFakeEconomyDb();
        await assertRejected(applyLedgerTransaction(db, entry({ amount })), 400, 'AMOUNT_OUT_OF_RANGE');
        assert.equal(db._inspect.wallets.size, 0, '지갑 행이 생김');
        assert.equal(db._inspect.ledgerEntries.length, 0, '장부 줄이 생김');
    });
}

// ── A12-B-007~010: 금액 끝 10억 경계 ──

test('A12-B-007 +1,000,000,000 → 됨, 잔액 10억', async () => {
    const db = createFakeEconomyDb();
    const result = await applyLedgerTransaction(db, entry({ amount: MAX }));
    assert.equal(result.ledgerEntry.amount, MAX);
    assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_gold, MAX);
});

test('A12-B-008 +1,000,000,001 → 거절, 지갑·장부 그대로', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'a12-amount-u1', { gold: 0 });
    await assert.rejects(applyLedgerTransaction(db, entry({ amount: MAX + 1 })), (error) => error.status === 400);
    assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_gold, 0);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('A12-B-009 −1,000,000,000 → 됨 (잔액 10억에서 0으로)', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'a12-amount-u1', { gold: MAX });
    const result = await applyLedgerTransaction(db, entry({ amount: -MAX }));
    assert.equal(result.ledgerEntry.amount, -MAX);
    assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_gold, 0);
});

test('A12-B-010 −1,000,000,001 → 거절, 지갑·장부 그대로', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'a12-amount-u1', { gold: MAX });
    await assert.rejects(applyLedgerTransaction(db, entry({ amount: -(MAX + 1) })), (error) => error.status === 400);
    assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_gold, MAX);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

// ── A12-B-011~015: 지갑 돈은 골드·다이아 둘뿐 ──

const CURRENCIES = [
    ['A12-B-011', 'GOLD', true, 'balance_gold'],
    ['A12-B-012', 'DIAMOND', true, 'balance_diamond'],
    ['A12-B-013', 'KRW', false],
    ['A12-B-014', 'gold', false],
    ['A12-B-015', '', false],
];
for (const [id, currency, ok, column] of CURRENCIES) {
    const label = currency === '' ? '빈 글자' : currency;
    test(`${id} 통화 ${label} → ${ok ? '됨' : '400 INVALID_CURRENCY'}`, async () => {
        const db = createFakeEconomyDb();
        const promise = applyLedgerTransaction(db, entry({ currency }));
        if (ok) {
            await promise;
            assert.equal(db._inspect.wallets.get('a12-amount-u1')[column], 10);
            return;
        }
        await assertRejected(promise, 400, 'INVALID_CURRENCY');
        assert.equal(db._inspect.wallets.size, 0, '지갑 행이 생김');
        assert.equal(db._inspect.ledgerEntries.length, 0);
    });
}

// ── A12-B-016~021: 같은 참조 번호로 다시 온 요청이 같은 내용인지 ──

// 처음 요청: 사유 REWARD · 아이템 없음(null) · GOLD · 10
const FIRST = { reason: 'REWARD', itemId: null, currency: 'GOLD', amount: 10 };

const RETRIES = [
    ['A12-B-016', '사유·아이템·통화·금액 다 같음', { ...FIRST }, true],
    ['A12-B-017', '사유 다름', { ...FIRST, reason: 'EVENT' }, false],
    ['A12-B-018', '아이템 다름', { ...FIRST, itemId: 'profile-border-남작' }, false],
    ['A12-B-019', '통화 다름', { ...FIRST, currency: 'DIAMOND' }, false],
    ['A12-B-020', '금액 다름', { ...FIRST, amount: 11 }, false],
    ['A12-B-021', '아이템 null과 없음', { reason: 'REWARD', currency: 'GOLD', amount: 10 }, true],
];
for (const [id, label, retry, same] of RETRIES) {
    test(`${id} 같은 참조 번호 다시 (${label}) → ${same ? '같음: 처음 결과 그대로' : '다름: 409 REFERENCE_EVENT_CONFLICT'}, 잔액 한 번만`, async () => {
        const db = createFakeEconomyDb();
        const first = await applyLedgerTransaction(db, entry(FIRST));
        const promise = applyLedgerTransaction(db, entry(retry));
        if (same) {
            const again = await promise;
            assert.equal(again.idempotent, true);
            assert.equal(again.ledgerEntry.id, first.ledgerEntry.id);
        } else {
            await assertRejected(promise, 409, 'REFERENCE_EVENT_CONFLICT');
        }
        assert.equal(db._inspect.ledgerEntries.length, 1, '장부가 두 줄');
        assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_gold, 10);
        assert.equal(db._inspect.wallets.get('a12-amount-u1').balance_diamond, 0);
    });
}
