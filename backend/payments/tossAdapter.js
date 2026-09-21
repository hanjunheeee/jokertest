'use strict';

// F-32a 토스페이먼츠 **테스트** 승인 어댑터. 키(secret)와 외부 통신을 이 파일만 소유한다.
//
// - 키는 서버 환경변수 TOSS_TEST_CLIENT_KEY(test_ck_…)·TOSS_TEST_SECRET_KEY(test_sk_…)에서만
//   읽는다. 누락·live 키·혼합·잘못된 형식은 외부 호출을 하기 전에 CONFIG_MISSING으로 거부한다.
//   접두어 검사는 형식 검증일 뿐이며 같은 상점의 키 쌍인지는 실제 제공자 호출 없이 알 수 없다.
// - 프런트로 나가는 값은 공개 clientKey뿐이다(getClientKey). secret은 응답·로그·오류 어디에도
//   담기지 않는다 — 제공자 응답 원문·메시지도 오류에 싣지 않고 안정적인 코드만 남긴다.
// - 승인 POST /v1/payments/confirm, 조회 GET /v1/payments/{paymentKey}. 승인은 주문별로
//   변하지 않는 멱등키(topup-confirm:{orderId})를 Idempotency-Key로 보낸다. 제공자의 멱등키
//   유효기간에만 단일 지급을 의존하지 않는다(영속 주문·결제키·원장 제약이 따로 보호한다).
//
// 결과 형식(예외를 던지는 것은 CONFIG_MISSING뿐이다):
//   { ok: true,  payment: { paymentKey, orderId, totalAmount, currency, providerStatus: 'DONE' } }
//   { ok: false, outcome, code, payment? }
//   outcome: REJECTED(제공자가 확정적으로 거절) | FAILED | CANCELED | EXPIRED(확인된 결제 상태)
//          | PENDING(READY·IN_PROGRESS·WAITING_FOR_DEPOSIT 등 승인 전) | MISMATCH(응답이 요청과
//          다름) | UNKNOWN(전송 오류·timeout·5xx·깨진 응답 — 승인 여부를 알 수 없다)

const { createError } = require('../utils/appError');

const TOSS_API_ORIGIN = 'https://api.tosspayments.com';
const CONFIRM_URL = `${TOSS_API_ORIGIN}/v1/payments/confirm`;
const paymentUrl = (paymentKey) => `${TOSS_API_ORIGIN}/v1/payments/${encodeURIComponent(paymentKey)}`;
// 주문에서 복원되는 불변 멱등키 — 재시도·새 서비스 인스턴스·응답 유실 뒤에도 같은 값이다.
const idempotencyKeyOf = (orderId) => `topup-confirm:${orderId}`;
const DEFAULT_TIMEOUT_MS = 10_000;

const KEY_BODY = /^[A-Za-z0-9_=+/-]{8,200}$/;
const CLIENT_KEY_PREFIX = 'test_ck_';
const SECRET_KEY_PREFIX = 'test_sk_';

const configMissing = () => createError('결제 설정이 올바르지 않습니다.', 503, 'CONFIG_MISSING');

const isValidKey = (value, prefix) => (
    typeof value === 'string'
    && value.startsWith(prefix)
    && KEY_BODY.test(value.slice(prefix.length))
);

/** 공개 clientKey만 검증한다(주문 생성 응답용). secret은 읽지 않는다. */
const readClientKey = (env = process.env) => {
    const clientKey = env.TOSS_TEST_CLIENT_KEY;
    if (!isValidKey(clientKey, CLIENT_KEY_PREFIX)) throw configMissing();
    return clientKey;
};

/** 승인·조회에 쓰는 키 쌍 전체를 검증한다. 하나라도 어긋나면 CONFIG_MISSING이다. */
const readConfig = (env = process.env) => {
    const clientKey = env.TOSS_TEST_CLIENT_KEY;
    const secretKey = env.TOSS_TEST_SECRET_KEY;
    if (!isValidKey(clientKey, CLIENT_KEY_PREFIX) || !isValidKey(secretKey, SECRET_KEY_PREFIX)) {
        throw configMissing();
    }
    return { clientKey, secretKey };
};

const basicAuthHeader = (secretKey) => `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;

const defaultTransport = async (url, { method, headers, body, timeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { method, headers, body, signal: controller.signal });
        return { status: response.status, bodyText: await response.text() };
    } finally {
        clearTimeout(timer);
    }
};

const STATUS_OUTCOMES = Object.freeze({
    DONE: 'DONE',
    ABORTED: 'FAILED',
    EXPIRED: 'EXPIRED',
    CANCELED: 'CANCELED',
    PARTIAL_CANCELED: 'CANCELED',
    READY: 'PENDING',
    IN_PROGRESS: 'PENDING',
    WAITING_FOR_DEPOSIT: 'PENDING',
});

const SAFE_CODE = /^[A-Z0-9_]{1,80}$/;
const unknownResult = (code = 'PAYMENT_UNCERTAIN') => ({ ok: false, outcome: 'UNKNOWN', code });

const parseJson = (bodyText) => {
    try {
        const parsed = JSON.parse(bodyText);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

/** 제공자 결제 객체에서 필요한 필드만 뽑는다. 상태가 알려진 값이 아니면 null이다. */
const normalizePayment = (raw) => {
    const outcome = STATUS_OUTCOMES[raw?.status];
    if (!outcome) return null;
    if (typeof raw.paymentKey !== 'string' || typeof raw.orderId !== 'string') return null;
    return {
        outcome,
        payment: {
            paymentKey: raw.paymentKey,
            orderId: raw.orderId,
            totalAmount: raw.totalAmount,
            currency: raw.currency,
            providerStatus: raw.status,
        },
    };
};

const toSafeCode = (raw) => (typeof raw?.code === 'string' && SAFE_CODE.test(raw.code) ? raw.code : 'PROVIDER_ERROR');

/** HTTP 응답 하나를 위 결과 형식으로 바꾼다. 확정할 수 없으면 항상 UNKNOWN이다. */
const interpretResponse = ({ status, bodyText }) => {
    const body = parseJson(bodyText);

    if (status === 200) {
        const normalized = body && normalizePayment(body);
        if (!normalized) return unknownResult('PROVIDER_RESPONSE_INVALID');
        if (normalized.outcome === 'DONE') return { ok: true, payment: normalized.payment };
        return { ok: false, outcome: normalized.outcome, code: `PAYMENT_${normalized.payment.providerStatus}`, payment: normalized.payment };
    }
    // 키 문제(401/403)·요청 한도(429)·처리 중 충돌(409)·서버 오류(5xx)는 결제 자체의 실패가
    // 아니다 — 승인 불명으로 두어 주문을 실패로 확정하지 않는다.
    if (status === 401 || status === 403 || status === 409 || status === 429 || status >= 500) {
        return unknownResult(status === 401 || status === 403 ? 'PROVIDER_AUTH' : 'PAYMENT_UNCERTAIN');
    }
    if (status >= 400) {
        if (!body) return unknownResult('PROVIDER_RESPONSE_INVALID');
        return { ok: false, outcome: 'REJECTED', code: toSafeCode(body) };
    }
    return unknownResult('PROVIDER_RESPONSE_INVALID');
};

/**
 * @param {object} [options]
 * @param {() => object} [options.getEnv] 호출마다 환경을 읽는다(기본 process.env)
 * @param {Function} [options.transport] (url, {method, headers, body, timeoutMs}) → {status, bodyText}
 * @param {number} [options.timeoutMs]
 */
const createTossAdapter = ({ getEnv = () => process.env, transport = defaultTransport, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
    const send = async (url, request) => {
        let response;
        try {
            response = await transport(url, { ...request, timeoutMs });
        } catch {
            // 원본 오류(요청·응답·헤더를 담을 수 있다)는 버리고 "승인 불명"만 남긴다.
            return unknownResult('PAYMENT_UNCERTAIN');
        }
        if (!response || !Number.isInteger(response.status) || typeof response.bodyText !== 'string') {
            return unknownResult('PAYMENT_UNCERTAIN');
        }
        return interpretResponse(response);
    };

    const getClientKey = () => readClientKey(getEnv());

    // 서비스가 주문 상태를 바꾸기 전에 호출한다 — 설정이 없으면 외부 호출도, 상태 변경도 없다.
    const assertConfigured = () => { readConfig(getEnv()); };

    const confirmPayment = async ({ paymentKey, orderId, amount }) => {
        const { secretKey } = readConfig(getEnv());
        const result = await send(CONFIRM_URL, {
            method: 'POST',
            headers: {
                Authorization: basicAuthHeader(secretKey),
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKeyOf(orderId),
            },
            body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        if (result.ok || result.payment) {
            const payment = result.payment;
            const matches = payment.paymentKey === paymentKey
                && payment.orderId === orderId
                && payment.totalAmount === amount
                && payment.currency === 'KRW';
            if (!matches) return { ok: false, outcome: 'MISMATCH', code: 'PAYMENT_MISMATCH' };
        }
        return result;
    };

    const getPayment = async ({ paymentKey }) => {
        const { secretKey } = readConfig(getEnv());
        const result = await send(paymentUrl(paymentKey), {
            method: 'GET',
            headers: { Authorization: basicAuthHeader(secretKey) },
        });
        // 조회 응답의 결제키는 요청한 키와 같아야 한다(주문·금액 대조는 호출한 서비스가 한다).
        if (result.payment && result.payment.paymentKey !== paymentKey) {
            return { ok: false, outcome: 'MISMATCH', code: 'PAYMENT_MISMATCH' };
        }
        return result;
    };

    return { confirmPayment, getPayment, getClientKey, assertConfigured };
};

// 서비스는 모듈 객체의 프로퍼티를 호출 시점에 읽는다(topup.service.js) — 시험이 이 프로퍼티를
// 일시적으로 바꿔 가짜 어댑터를 끼울 수 있게 하되, 운영 환경변수로 구현을 고르는 경로는 없다.
module.exports = {
    ...createTossAdapter(),
    createTossAdapter,
    readConfig,
    readClientKey,
    CONFIRM_URL,
    paymentUrl,
    basicAuthHeader,
    idempotencyKeyOf,
};
