'use strict';

// 거래 내역 시험 (브라우저 시험 store S-3, 2026-11-09)
// 새 계정 거래 내역을 0골드 기본 지급 줄(약 25줄)이 채우던 문제: 내역에선 빼고 장부엔 그대로 남김
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const economy = require('../../../services/economy');
const ledgerRepository = require('../../../repositories/economy/ledger');
const { createFakeEconomyDb } = require('../../audit-2026-11-09/fakeEconomyDb');

test('새 계정: 기본 지급 뒤 거래 내역은 비어 있고, 장부엔 기본 지급 줄이 그대로 남음', async () => {
    const db = createFakeEconomyDb();
    await economy.ensureDefaultEntitlements('u', db);

    assert.deepEqual(await economy.listTransactions('u', {}, db), []);
    const ledger = db._inspect.ledgerEntries.filter((e) => e.user_id === 'u');
    assert.equal(ledger.length, 25);
    assert.ok(ledger.every((e) => e.reason === 'DEFAULT_GRANT' && e.amount === 0));
});

test('기본 지급 뒤 진짜 돈 움직임은 내역에 보이고, limit은 보이는 줄 기준', async () => {
    const db = createFakeEconomyDb();
    await economy.ensureDefaultEntitlements('u', db);
    await economy.grantReward({ userId: 'u', amount: 7, referenceEventId: 'r1' }, db);
    await economy.grantReward({ userId: 'u', amount: 9, referenceEventId: 'r2' }, db);

    const rows = await economy.listTransactions('u', { limit: 2 }, db);
    assert.deepEqual(rows.map((row) => row.amount), [9, 7]);
});

test('저장소: 거래 목록 쿼리는 0골드 기본 지급 줄만 DB에서 뺌 (다른 0원 줄·다른 사유는 그대로)', async () => {
    let query = null;
    const models = { EconomyLedgerEntry: { findAll: async (q) => { query = q; return []; } } };
    await ledgerRepository.listEntries(models, 'u', 50);
    assert.equal(query.where.user_id, 'u');
    assert.deepEqual(query.where[Op.not], { reason: 'DEFAULT_GRANT', amount: 0 });
    assert.equal(query.limit, 50);
});
