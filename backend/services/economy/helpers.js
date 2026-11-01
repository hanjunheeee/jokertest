'use strict';

// 경제 도우미 파일, 값 확인·직업별 스킨·같은 요청 판정·충돌 오류·db 기본값
// 장부·구매·장착·팔레트 파일이 같이 씀
const { createError } = require('../../utils/appError');
const { FREE_JOB_SKIN_IDS_BY_SLOT, CURRENCY_TO_WALLET_COLUMN, MAX_BALANCE, JOB_SKIN_COLUMN_BY_JOB_ID } = require('./constants');

// 그 칸의 기본 스킨인지
const isFreeJobSkin = (slot, itemId) => (FREE_JOB_SKIN_IDS_BY_SLOT[slot] ?? []).includes(itemId);

// 아는 통화인지
const isValidCurrency = (currency) => Object.prototype.hasOwnProperty.call(CURRENCY_TO_WALLET_COLUMN, currency);

// 안전한 정수이고 최대 잔액 안인지
const isBoundedAmount = (amount) => Number.isInteger(amount) && Number.isSafeInteger(amount) && Math.abs(amount) <= MAX_BALANCE;

// 장착 행에서 직업별 스킨만 뽑음 (없으면 null)
const buildSkinsByJob = (loadout) => Object.fromEntries(
    Object.entries(JOB_SKIN_COLUMN_BY_JOB_ID).map(([jobId, column]) => [jobId, loadout?.[column] ?? null]),
);

// db 안 넘기면 진짜 models (부를 때 require, 시험은 가짜 db 넘김)
const defaultDb = () => require('../../models');

// 같은 참조 id로 다시 온 장부 요청이 처음과 같은 내용인지
const payloadMatches = (entry, { reason, itemId, currency, amount }) =>
    entry.reason === reason
    && (entry.item_id ?? null) === (itemId ?? null)
    && entry.currency === currency
    && entry.amount === amount;

// 같은 참조 id에 다른 내용이면 409
const referenceEventConflictError = () =>
    createError('참조 사건 ID가 이미 다른 요청에 사용되었습니다.', 409, 'REFERENCE_EVENT_CONFLICT');

// 구매 요청 내용 비교 (JSON 그대로)
const purchasePayloadsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 구매 요청 충돌도 같은 409
const purchaseRequestConflictError = referenceEventConflictError;

// 장부 행에서 응답용 값만
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
    referenceEventConflictError,
    purchasePayloadsEqual,
    purchaseRequestConflictError,
    snapshotLedgerEntry,
};
