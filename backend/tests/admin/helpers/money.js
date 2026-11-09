'use strict';

// 돈 시험 도우미 파일, 시험 회원 만들기 · 장부로 잔액 채우기 · 지급된 충전 주문 만들기 · 지갑 = 장부 합 확인
// 관리자 돈 통합 시험(결제·환불, 주고 뺏기, 상품, 쿠폰)이 씀, 진짜 시험 DB에서만
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const db = () => require('../../../models');
const { applyLedgerTransaction } = require('../../../services/economy/ledger');

const tag = () => crypto.randomBytes(4).toString('hex');

// 시험 회원 한 명 → users 줄
const createMember = async (prefix = 'mn') => {
    const t = tag();
    return db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `${prefix}${t}`, email: `${prefix}${t}@example.com` });
};

// 장부로 잔액 넣기 (시험 사유, 지갑 직접 안 고침)
const fund = (userId, currency, amount) => applyLedgerTransaction(db(), {
    userId, reason: 'QA_TEST_GRANT', currency, amount, referenceEventId: `test:${crypto.randomUUID()}`,
});

// 지급까지 끝난 충전 주문 (게임 서버 지급처럼 topup:<id> 장부 한 줄 + GRANTED)
const createGrantedOrder = async (userId, { grantAmount = 100, bonusAmount = 10, payAmount = 1100, status = 'GRANTED' } = {}) => {
    const orderId = `ord-${crypto.randomUUID()}`;
    const now = new Date();
    await db().EconomyTopupOrder.create({
        order_id: orderId,
        user_id: userId,
        product_id: 'test-diamond-110',
        version: 1,
        pay_amount: payAmount,
        grant_amount: grantAmount,
        bonus_amount: bonusAmount,
        order_name: '다이아 110개',
        status,
        payment_key: `pk_${tag()}${tag()}`,
        approved_at: now,
        granted_at: status === 'GRANTED' ? now : null,
    });
    if (status === 'GRANTED') {
        await applyLedgerTransaction(db(), {
            userId, reason: 'DIAMOND_TOPUP', currency: 'DIAMOND', amount: grantAmount + bonusAmount, referenceEventId: `topup:${orderId}`,
        });
    }
    return db().EconomyTopupOrder.findOne({ where: { order_id: orderId }, raw: true });
};

const walletOf = async (userId) => {
    const row = await db().sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });
    return { gold: Number(row?.balance_gold ?? 0), diamond: Number(row?.balance_diamond ?? 0) };
};

const ledgerOf = (userId) => db().EconomyLedgerEntry.findAll({ where: { user_id: userId }, order: [['id', 'ASC']], raw: true });

// 돈 시험 공통 확인: 지갑 잔액 = 그 사람 장부 amount 합 (통화마다), 참조 id 겹침 없음
const assertWalletMatchesLedger = async (userId) => {
    const entries = await ledgerOf(userId);
    const sum = (currency) => entries.filter((entry) => entry.currency === currency).reduce((total, entry) => total + Number(entry.amount), 0);
    const wallet = await walletOf(userId);
    assert.equal(wallet.gold, sum('GOLD'), '골드 지갑 = 장부 합');
    assert.equal(wallet.diamond, sum('DIAMOND'), '다이아 지갑 = 장부 합');
    const references = entries.map((entry) => entry.reference_event_id);
    assert.equal(new Set(references).size, references.length, '장부 참조 id 겹침 없음');
    return { wallet, entries };
};

const auditLogsOf = (action, targetId) => db().AdminAuditLog.findAll({ where: { action, target_id: String(targetId) }, raw: true });

module.exports = {
    createMember,
    fund,
    createGrantedOrder,
    walletOf,
    ledgerOf,
    assertWalletMatchesLedger,
    auditLogsOf,
};
