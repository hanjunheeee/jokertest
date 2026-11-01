'use strict';

const { createError } = require('../appError');

const TOSS_API_ORIGIN = 'https://api.tosspayments.com';
const CONFIRM_URL = `${TOSS_API_ORIGIN}/v1/payments/confirm`;
const paymentUrl = (paymentKey) => `${TOSS_API_ORIGIN}/v1/payments/${encodeURIComponent(paymentKey)}`;
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

const readClientKey = (env = process.env) => {
    const clientKey = env.TOSS_TEST_CLIENT_KEY;
    if (!isValidKey(clientKey, CLIENT_KEY_PREFIX)) throw configMissing();
    return clientKey;
};

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

const interpretResponse = ({ status, bodyText }) => {
    const body = parseJson(bodyText);

    if (status === 200) {
        const normalized = body && normalizePayment(body);
        if (!normalized) return unknownResult('PROVIDER_RESPONSE_INVALID');
        if (normalized.outcome === 'DONE') return { ok: true, payment: normalized.payment };
        return { ok: false, outcome: normalized.outcome, code: `PAYMENT_${normalized.payment.providerStatus}`, payment: normalized.payment };
    }
    if (status === 401 || status === 403 || status === 409 || status === 429 || status >= 500) {
        return unknownResult(status === 401 || status === 403 ? 'PROVIDER_AUTH' : 'PAYMENT_UNCERTAIN');
    }
    if (status >= 400) {
        if (!body) return unknownResult('PROVIDER_RESPONSE_INVALID');
        return { ok: false, outcome: 'REJECTED', code: toSafeCode(body) };
    }
    return unknownResult('PROVIDER_RESPONSE_INVALID');
};

const createTossAdapter = ({ getEnv = () => process.env, transport = defaultTransport, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
    const send = async (url, request) => {
        let response;
        try {
            response = await transport(url, { ...request, timeoutMs });
        } catch {
            return unknownResult('PAYMENT_UNCERTAIN');
        }
        if (!response || !Number.isInteger(response.status) || typeof response.bodyText !== 'string') {
            return unknownResult('PAYMENT_UNCERTAIN');
        }
        return interpretResponse(response);
    };

    const getClientKey = () => readClientKey(getEnv());

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
        if (result.payment && result.payment.paymentKey !== paymentKey) {
            return { ok: false, outcome: 'MISMATCH', code: 'PAYMENT_MISMATCH' };
        }
        return result;
    };

    return { confirmPayment, getPayment, getClientKey, assertConfigured };
};

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
