'use strict';

// 토스페이먼츠 어댑터 파일, 결제 승인·결제 조회 요청 + 응답을 정해진 결과 모양으로 바꾸기 + 키 읽기(운영 live·개발 test)
// 충전 서비스가 topup/helpers.js adapterOf로 꺼내 씀 (시험은 가짜를 넣음)
const { createError } = require('../appError');
const { isProduction } = require('../../config/nodeEnv');
const { isE2eHooksEnabled } = require('../../config/e2eHooks');

// 토스 API 주소 · 같은 주문 승인을 두 번 보내도 한 번만 처리되게 주문마다 같은 멱등 키
const TOSS_API_ORIGIN = 'https://api.tosspayments.com';
const CONFIRM_URL = `${TOSS_API_ORIGIN}/v1/payments/confirm`;
const paymentUrl = (paymentKey, origin = TOSS_API_ORIGIN) => `${origin}/v1/payments/${encodeURIComponent(paymentKey)}`;
const idempotencyKeyOf = (orderId) => `topup-confirm:${orderId}`;
const DEFAULT_TIMEOUT_MS = 10_000;

// 키 모양: 앞말 + 정해진 글자 8~200자
const KEY_BODY = /^[A-Za-z0-9_=+/-]{8,200}$/;

// 키 묶음 둘: 시험(test_)·운영(live_), 환경값 이름도 나눔 (N-7)
const KEY_SETS = Object.freeze({
    test: Object.freeze({
        mode: 'test', clientName: 'TOSS_TEST_CLIENT_KEY', secretName: 'TOSS_TEST_SECRET_KEY', clientPrefix: 'test_ck_', secretPrefix: 'test_sk_',
    }),
    live: Object.freeze({
        mode: 'live', clientName: 'TOSS_LIVE_CLIENT_KEY', secretName: 'TOSS_LIVE_SECRET_KEY', clientPrefix: 'live_ck_', secretPrefix: 'live_sk_',
    }),
});

// 키가 없거나 모양이 틀리면 503 (어느 키가 틀렸는지는 안 알림)
const configMissing = () => createError('결제 설정이 올바르지 않습니다.', 503, 'CONFIG_MISSING');

// 문자열이고 앞말이 맞고 나머지 모양도 맞는지
const isValidKey = (value, prefix) => (
    typeof value === 'string'
    && value.startsWith(prefix)
    && KEY_BODY.test(value.slice(prefix.length))
);

const hasValue = (value) => typeof value === 'string' && value.trim() !== '';

// 토스 주소: 브라우저 시험(E2E_HOOKS=1, 운영 아님)에 TOSS_API_BASE_URL 있을 때만 가짜 승인 서버로, 아니면 진짜 주소
// 운영에 이 값이 있으면 서버가 시작 거부 (config/e2eHooks.js), 끝 빗금 뗌
const apiOriginOf = (env = process.env) => (
    isE2eHooksEnabled(env) && hasValue(env.TOSS_API_BASE_URL) ? env.TOSS_API_BASE_URL.trim().replace(/\/+$/, '') : TOSS_API_ORIGIN
);

// 운영 키 이름이 하나라도 채워졌는지
const hasLiveKeys = (env) => hasValue(env.TOSS_LIVE_CLIENT_KEY) || hasValue(env.TOSS_LIVE_SECRET_KEY);

// 쓸 키 묶음: 운영 + 운영 키 이름 채워짐 → live (모양 틀려도 시험 키로 안 내려감, 503)
// 나머지(운영인데 운영 키 없음·개발·시험) → test, 개발은 운영 키 있어도 안 씀 (실수로 실제 결제 막기)
const pickKeySet = (env) => (isProduction(env) && hasLiveKeys(env) ? KEY_SETS.live : KEY_SETS.test);

// 결제창에 줄 클라이언트 키만 (비밀 키 없어도 됨)
const readClientKey = (env = process.env) => {
    const set = pickKeySet(env);
    const clientKey = env[set.clientName];
    if (!isValidKey(clientKey, set.clientPrefix)) throw configMissing();
    return clientKey;
};

// 승인·조회용: 같은 묶음의 클라이언트 키·비밀 키 둘 다 맞아야 함 (시험·운영 키 섞기 안 됨)
const readConfig = (env = process.env) => {
    const set = pickKeySet(env);
    const clientKey = env[set.clientName];
    const secretKey = env[set.secretName];
    if (!isValidKey(clientKey, set.clientPrefix) || !isValidKey(secretKey, set.secretPrefix)) {
        throw configMissing();
    }
    return { clientKey, secretKey };
};

// 켤 때 경고 글 (없으면 null), 키 값은 안 넣음
// 운영인데 시험 키로 돌면 결제해도 돈이 안 들어옴 → 경고만 하고 켬
const describeKeyWarning = (env = process.env) => {
    const set = pickKeySet(env);
    const valid = isValidKey(env[set.clientName], set.clientPrefix) && isValidKey(env[set.secretName], set.secretPrefix);
    if (!isProduction(env)) {
        return hasLiveKeys(env) ? '개발·시험 환경이라 토스 운영 키(TOSS_LIVE_*)는 안 씀, 시험 키(TOSS_TEST_*)만 씀' : null;
    }
    if (set.mode === 'live') {
        return valid ? null : '토스 운영 키(TOSS_LIVE_CLIENT_KEY·TOSS_LIVE_SECRET_KEY) 모양이 틀리거나 하나가 빠짐 — 충전이 "설정 대기"(503)';
    }
    if (valid) return '운영인데 토스 시험 키(TOSS_TEST_*)로 돎 — 결제해도 돈이 안 들어옴, TOSS_LIVE_CLIENT_KEY·TOSS_LIVE_SECRET_KEY 넣기';
    return '토스 키 없음 — 충전이 "설정 대기"(503)';
};

// 토스 인증 헤더: 비밀 키 + ':' 을 base64로
const basicAuthHeader = (secretKey) => `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;

// 기본 전송: fetch로 보내고 시간 넘으면 끊음 → { 상태 코드, 본문 글자 }
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

// 토스 결제 상태 → 우리 결과 (DONE만 성공, 진행 중 상태는 PENDING, 표에 없는 상태는 응답 이상으로 봄)
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

// 결제사 오류 코드는 이 모양일 때만 그대로 씀 (로그·저장에 이상한 글자 안 들어가게)
const SAFE_CODE = /^[A-Z0-9_]{1,80}$/;
// 결제가 됐는지 모르는 결과 (나중에 조회로 다시 확인)
const unknownResult = (code = 'PAYMENT_UNCERTAIN') => ({ ok: false, outcome: 'UNKNOWN', code });

// 본문이 JSON 객체일 때만, 아니면 null
const parseJson = (bodyText) => {
    try {
        const parsed = JSON.parse(bodyText);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

// 결제 응답에서 아는 상태·결제 키·주문 id가 있을 때만 필요한 칸만 꺼냄
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

// 안전한 모양 아니면 PROVIDER_ERROR
const toSafeCode = (raw) => (typeof raw?.code === 'string' && SAFE_CODE.test(raw.code) ? raw.code : 'PROVIDER_ERROR');

// 응답 → 결과: 200은 결제 상태로, 인증·충돌·한도·서버 오류는 결제 여부 모름, 나머지 4xx는 거절
const interpretResponse = ({ status, bodyText }) => {
    const body = parseJson(bodyText);

    // 200이어도 모르는 모양이면 결제 여부 모름, DONE 아닌 상태는 그 상태로 실패
    if (status === 200) {
        const normalized = body && normalizePayment(body);
        if (!normalized) return unknownResult('PROVIDER_RESPONSE_INVALID');
        if (normalized.outcome === 'DONE') return { ok: true, payment: normalized.payment };
        return { ok: false, outcome: normalized.outcome, code: `PAYMENT_${normalized.payment.providerStatus}`, payment: normalized.payment };
    }
    if (status === 401 || status === 403 || status === 409 || status === 429 || status >= 500) {
        return unknownResult(status === 401 || status === 403 ? 'PROVIDER_AUTH' : 'PAYMENT_UNCERTAIN');
    }
    // 본문 못 읽는 4xx는 거절인지도 모름
    if (status >= 400) {
        if (!body) return unknownResult('PROVIDER_RESPONSE_INVALID');
        return { ok: false, outcome: 'REJECTED', code: toSafeCode(body) };
    }
    return unknownResult('PROVIDER_RESPONSE_INVALID');
};

// 돌아온 결제가 보낸 키·주문·금액·원화와 같은지
const matchesConfirmRequest = (payment, { paymentKey, orderId, amount }) =>
    payment.paymentKey === paymentKey
    && payment.orderId === orderId
    && payment.totalAmount === amount
    && payment.currency === 'KRW';

// 어댑터 만들기 (환경 변수 읽기·전송·시간 한도를 바꿔 끼울 수 있음, 키는 부를 때마다 새로 읽음)
const createTossAdapter = ({ getEnv = () => process.env, transport = defaultTransport, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
    // 보내다 터지거나 응답 모양이 이상하면 결제 여부 모름으로
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

    // 결제창용 클라이언트 키
    const getClientKey = () => readClientKey(getEnv());

    // 승인 전에 키 설정부터 확인 (없으면 503)
    const assertConfigured = () => { readConfig(getEnv()); };

    // 결제 승인: 같은 주문엔 같은 멱등 키, 돌아온 결제가 보낸 키·주문·금액·원화와 다르면 MISMATCH
    const confirmPayment = async ({ paymentKey, orderId, amount }) => {
        const env = getEnv();
        const { secretKey } = readConfig(env);
        const origin = apiOriginOf(env);
        const result = await send(origin === TOSS_API_ORIGIN ? CONFIRM_URL : `${origin}/v1/payments/confirm`, {
            method: 'POST',
            headers: {
                Authorization: basicAuthHeader(secretKey),
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKeyOf(orderId),
            },
            body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        if ((result.ok || result.payment) && !matchesConfirmRequest(result.payment, { paymentKey, orderId, amount })) {
            return { ok: false, outcome: 'MISMATCH', code: 'PAYMENT_MISMATCH' };
        }
        return result;
    };

    // 결제 조회 (승인 결과를 모를 때 다시 확인), 다른 결제 키가 오면 MISMATCH
    const getPayment = async ({ paymentKey }) => {
        const env = getEnv();
        const { secretKey } = readConfig(env);
        const result = await send(paymentUrl(paymentKey, apiOriginOf(env)), {
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

// 기본 어댑터 함수들 + 시험용 만들기 함수·주소·헤더·키 도구
module.exports = {
    ...createTossAdapter(),
    createTossAdapter,
    readConfig,
    readClientKey,
    describeKeyWarning,
    KEY_SETS,
    CONFIRM_URL,
    paymentUrl,
    apiOriginOf,
    basicAuthHeader,
    idempotencyKeyOf,
};
