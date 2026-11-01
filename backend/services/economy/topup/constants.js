'use strict';

// 충전 상수 파일, 주문 상태·실패 상태·잠금 시간·값 모양·결과→상태·열린 주문 한도
// 충전 안 파일 전부가 씀 (일부는 topup/index.js가 내보냄)

// 주문 상태 (만듦 → 확인 중 → 지급 대기 → 지급됨 / 실패·취소·만료)
const ORDER_STATUS = Object.freeze({
    CREATED: 'CREATED',
    CONFIRMING: 'CONFIRMING',
    PENDING_GRANT: 'PENDING_GRANT',
    GRANTED: 'GRANTED',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED',
});

// 끝난 실패 상태 (다시 확인 안 함)
const FAILURE_STATUSES = new Set([ORDER_STATUS.FAILED, ORDER_STATUS.CANCELED, ORDER_STATUS.EXPIRED]);

// 한 요청이 주문을 잡고 있는 시간 (동시 확인 막기)
const LEASE_MS = 30_000;

// 주문 id 모양
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

// 결제 키 모양
const PAYMENT_KEY_PATTERN = /^[A-Za-z0-9_=+/.-]{1,200}$/;

// 로그·실패 코드로 남겨도 되는 코드 모양
const SAFE_LOG_CODE = /^[A-Z0-9_]{1,80}$/;

// 결제사 실패 결과마다 주문 상태 (PENDING·UNKNOWN은 표에 없어 확인 중 그대로)
const FAILURE_STATUS_BY_OUTCOME = Object.freeze({
    REJECTED: ORDER_STATUS.FAILED,
    FAILED: ORDER_STATUS.FAILED,
    MISMATCH: ORDER_STATUS.FAILED,
    CANCELED: ORDER_STATUS.CANCELED,
    EXPIRED: ORDER_STATUS.EXPIRED,
});

// 아직 안 끝난 주문 상태
const OPEN_ORDER_STATUSES = [ORDER_STATUS.CONFIRMING, ORDER_STATUS.PENDING_GRANT];

// 열린 주문 목록 최대 개수
const OPEN_ORDER_LIMIT = 5;

module.exports = {
    ORDER_STATUS,
    FAILURE_STATUSES,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    SAFE_LOG_CODE,
    FAILURE_STATUS_BY_OUTCOME,
    OPEN_ORDER_STATUSES,
    OPEN_ORDER_LIMIT,
};
