'use strict';

// 경제 시험 손잡이 파일
// 시험이 장부 거래·지갑 행·기본 장착을 바로 부름
const { ensureDefaultLoadout } = require('./defaults');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');

// 시험용: 안쪽 함수 바로 부르기
const __internal = { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout };

module.exports = {
    __internal,
};
