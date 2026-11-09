'use strict';

// 골드·다이아 주고 뺏기 서비스 파일, 회원 지갑 보기 · 주기/뺏기를 장부 한 줄 + 관리자 기록 한 줄로 (한 트랜잭션)
// wallet.controller.js가 부름, 돈은 기존 장부 함수(applyLedgerTransaction)로만 → 지갑 = 장부 합 그대로
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');
const { applyLedgerTransaction } = require('../../../services/economy/ledger');
const { CURRENCY_TO_COLUMN } = require('../../../services/economy/constants');
const { isDeadlock } = require('../../../repositories/common');

const defaultDb = () => require('../../../repositories/common/db');

const LEDGER_LIMIT = 50;
// 데드락이면 다시 하는 최대 횟수
const MAX_ATTEMPTS = 3;
// 장부 사유: 주기 · 뺏기 (참조 id 앞말 admin:은 게임 서버 앞말 topup:·gold:·coupon:과 안 겹침)
const GRANT_REASON = 'ADMIN_GRANT';
const REVOKE_REASON = 'ADMIN_REVOKE';

const memberNotFound = () => createError('회원을 찾을 수 없어요.', 404, 'MEMBER_NOT_FOUND');
const referenceOf = (requestId) => `admin:${requestId}`;
const isoOf = (value) => (value ? new Date(value).toISOString() : null);
const plainOf = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

// 장부 한 줄 → 화면 모양 (예: { id:'9', reason:'ADMIN_GRANT', amount:100 } → { id:9, reason:'ADMIN_GRANT', amount:100, … })
const toLedgerView = (row) => {
    const entry = plainOf(row);
    return {
        id: Number(entry.id),
        reason: entry.reason,
        currency: entry.currency,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balance_after),
        referenceEventId: entry.reference_event_id,
        itemId: entry.item_id ?? null,
        createdAt: isoOf(entry.created_at),
    };
};

const assertMember = async (db, uuid, transaction) => {
    // 관리자 조회라 시간 제한 붙인 SQL (탈퇴 줄은 없는 회원과 같게)
    const [user] = await db.sequelize.query(
        queryQueue.withTimeoutHint('SELECT uuid FROM users WHERE uuid = :uuid AND deleted_at IS NULL LIMIT 1'),
        { replacements: { uuid }, type: db.Sequelize.QueryTypes.SELECT, transaction },
    );
    if (!user) throw memberNotFound();
};

// GET 지갑 → { gold, diamond, ledger:[최근 50] } (지갑 줄 없으면 0, 0골드 기본 지급 줄은 뺌)
const getWallet = async ({ uuid }, { db = defaultDb() } = {}) => queryQueue.run(async () => {
    await assertMember(db, uuid);
    const [wallet] = await db.sequelize.query(
        queryQueue.withTimeoutHint('SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = :uuid'),
        { replacements: { uuid }, type: db.Sequelize.QueryTypes.SELECT },
    );
    const ledger = await db.sequelize.query(
        queryQueue.withTimeoutHint(`SELECT id, reason, currency, amount, balance_after, reference_event_id, item_id, created_at
            FROM economy_ledger_entries WHERE user_id = :uuid AND NOT (reason = 'DEFAULT_GRANT' AND amount = 0)
            ORDER BY id DESC LIMIT :limit`),
        { replacements: { uuid, limit: LEDGER_LIMIT }, type: db.Sequelize.QueryTypes.SELECT },
    );
    return {
        gold: Number(wallet?.balance_gold ?? 0),
        diamond: Number(wallet?.balance_diamond ?? 0),
        ledger: ledger.map(toLedgerView),
    };
});

// 장부 오류 → 관리자 약속 코드 (모자람은 409 BALANCE_SHORT + 지금 잔액·필요한 양)
const toAdjustError = async (error, { db, uuid, currency, amount }) => {
    if (error?.code !== 'INSUFFICIENT_BALANCE') return error;
    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: uuid }, raw: true });
    const balance = Number(wallet?.[CURRENCY_TO_COLUMN[currency]] ?? 0);
    const short = createError(`뺏을 양이 모자라요. 지금 ${balance}, 뺏으려는 양 ${-amount}`, 409, 'BALANCE_SHORT');
    short.details = { balance, needed: -amount };
    return short;
};

// 같은 요청 번호가 동시에 와서 늦은 쪽이 겹침으로 되돌려졌을 때 → 먼저 끝난 쪽 결과
const findFirstResult = async (db, { uuid, requestId, currency, amount }) => {
    const entry = await db.EconomyLedgerEntry.findOne({ where: { user_id: uuid, reference_event_id: referenceOf(requestId) } });
    if (!entry) return null;
    const plain = plainOf(entry);
    if (plain.currency !== currency || Number(plain.amount) !== amount) {
        throw createError('같은 요청 번호로 다른 내용을 보냈어요. 창을 닫고 다시 해 주세요.', 409, 'REFERENCE_EVENT_CONFLICT');
    }
    return { ledgerEntry: toLedgerView(entry), balance: Number(plain.balance_after), replayed: true };
};

// 한 번 시도: 회원 확인 → 장부(바깥 트랜잭션) → 처음이면 기록 (같은 요청 번호면 장부가 처음 결과를 돌려주고 기록 안 남김)
const adjustOnce = (db, { req, uuid, requestId, currency, amount, reason }) => db.sequelize.transaction(async (transaction) => {
    await assertMember(db, uuid, transaction);
    const { idempotent, ledgerEntry } = await applyLedgerTransaction(db, {
        userId: uuid,
        reason: amount > 0 ? GRANT_REASON : REVOKE_REASON,
        currency,
        amount,
        referenceEventId: referenceOf(requestId),
    }, { transaction });
    const view = toLedgerView(ledgerEntry);
    if (idempotent) return { ledgerEntry: view, balance: view.balanceAfter, replayed: true };

    await audit.record({
        req,
        action: AUDIT_ACTIONS.WALLET_ADJUST,
        targetType: 'user',
        targetId: uuid,
        before: { currency, balance: view.balanceAfter - amount },
        after: { currency, amount, balance: view.balanceAfter, ledgerEntryId: view.id },
        reason,
        requestId,
    }, { transaction, db });
    return { ledgerEntry: view, balance: view.balanceAfter, replayed: false };
});

// 주기(amount > 0) · 뺏기(amount < 0) → { ledgerEntry, balance }
// 같은 사람 동시 요청 둘은 지갑 줄 만들기·잠금이 엇갈려 데드락이 날 수 있음 → 다 되돌려진 뒤 다시 (골드 구매와 같은 방식)
const adjustWallet = async (args, { db = defaultDb() } = {}) => {
    const input = { db, uuid: args.uuid, requestId: args.requestId, currency: args.currency, amount: args.amount };
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await adjustOnce(db, args);
        } catch (error) {
            if (isDeadlock(error) && attempt < MAX_ATTEMPTS) continue;
            if (error?.code === 'DUPLICATE_REFERENCE_EVENT') {
                const first = await findFirstResult(db, input);
                if (first) return first;
            }
            throw await toAdjustError(error, input);
        }
    }
};

module.exports = {
    GRANT_REASON,
    REVOKE_REASON,
    referenceOf,
    getWallet,
    adjustWallet,
};
