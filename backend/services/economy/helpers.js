'use strict';

// 경제 도우미 파일, 값 확인·직업별 스킨·같은 요청 판정·충돌 오류·db 기본값
// 경제 안 파일 대부분이 씀, buildSkinsByJob은 index 거쳐 controllers/economy/serializers.js도 씀
const { createError } = require('../../utils/appError');
const { FREE_SKINS_BY_SLOT, CURRENCY_TO_COLUMN, MAX_BALANCE, JOB_TO_SKIN_COLUMN } = require('./constants');

// 그 칸의 기본 스킨인지
const isFreeJobSkin = (slot, itemId) => (FREE_SKINS_BY_SLOT[slot] ?? []).includes(itemId);

// 아는 통화인지
const isValidCurrency = (currency) => Object.prototype.hasOwnProperty.call(CURRENCY_TO_COLUMN, currency);

// 안전한 정수이고 절댓값이 최대 잔액 안인지 (빼기는 음수로 옴)
const isBoundedAmount = (amount) => Number.isInteger(amount) && Number.isSafeInteger(amount) && Math.abs(amount) <= MAX_BALANCE;

// 장착 행에서 직업별 스킨만 뽑음 (없으면 null)
const buildSkinsByJob = (loadout) => Object.fromEntries(
    Object.entries(JOB_TO_SKIN_COLUMN).map(([jobId, column]) => [jobId, loadout?.[column] ?? null]),
);

// db 안 넘기면 진짜 models (부를 때 require, 가짜 db 넘기는 시험은 진짜 DB 안 엶)
const defaultDb = () => require('../../repositories/common/db');

// 같은 참조 id로 다시 온 장부 요청이 처음과 같은 내용인지
const payloadMatches = (entry, { reason, itemId, currency, amount }) =>
    entry.reason === reason
    && (entry.item_id ?? null) === (itemId ?? null)
    && entry.currency === currency
    && entry.amount === amount;

// 같은 참조 id에 다른 내용이면 409
const referenceConflictError = () =>
    createError('참조 사건 ID가 이미 다른 요청에 사용되었습니다.', 409, 'REFERENCE_EVENT_CONFLICT');

// 구매 요청 내용 비교 (정렬해 둔 값이라 JSON 비교로 충분)
const purchasePayloadsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 구매 요청 충돌도 같은 409
const purchaseConflictError = referenceConflictError;

// 장부 행을 평범한 객체로 (구매 결과 저장·응답용)
const snapshotLedgerEntry = (ledgerEntry) => (
    typeof ledgerEntry.get === 'function' ? ledgerEntry.get({ plain: true }) : ledgerEntry
);

module.exports = {
    isFreeJobSkin,
    isValidCurrency,
    isBoundedAmount,
    buildSkinsByJob,
    defaultDb,
    payloadMatches,
    referenceConflictError,
    purchasePayloadsEqual,
    purchaseConflictError,
    snapshotLedgerEntry,
};
