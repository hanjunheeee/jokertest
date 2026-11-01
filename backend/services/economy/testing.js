'use strict';

// 경제 시험 손잡이 파일, 장부 거래·지갑 행·기본 장착 안쪽 함수 묶음
// index가 __internal로 내보냄, 시험만 씀 (economy.service.test.js)
const { ensureDefaultLoadout } = require('./defaults');
const { ensureWalletRow, applyLedgerTransaction } = require('./ledger');

// 안쪽 함수 바로 부르게 묶음 (시험용)
const __internal = { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout };

module.exports = {
    __internal,
};
