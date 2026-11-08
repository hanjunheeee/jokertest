'use strict';

// 내부 API 열쇠 확인 미들웨어 파일, X-Internal-Key가 환경값 INTERNAL_API_KEY와 같을 때만 통과
// routes/internal.routes.js가 맨 앞에 둠, 키 없거나 32자 못 되면 경로 전체 꺼짐 (404처럼 지나감)
const crypto = require('crypto');

const MIN_KEY_LENGTH = 32;
const HEADER_NAME = 'x-internal-key';

// 지금 키 (부를 때마다 읽음, 시험이 바꿈), 짧으면 없는 것으로
const readConfiguredKey = (env = process.env) => {
    const key = typeof env.INTERNAL_API_KEY === 'string' ? env.INTERNAL_API_KEY : '';
    return key.length >= MIN_KEY_LENGTH ? key : null;
};

// 같은지: 둘 다 해시해 길이 맞춘 뒤 상수 시간 비교 (길이로도 안 새게)
const keysMatch = (given, expected) => {
    if (typeof given !== 'string' || given.length === 0) return false;
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
};

// 꺼짐: 다음 처리(없는 경로 404)로, 틀림: 401 (키 값은 어디에도 안 남김)
const requireInternalKey = ({ env = process.env } = {}) => (req, res, next) => {
    const expected = readConfiguredKey(env);
    if (!expected) return next('router');
    if (!keysMatch(req.get(HEADER_NAME), expected)) {
        return res.status(401).json({ ok: false, code: 'INTERNAL_UNAUTHORIZED' });
    }
    return next();
};

// 꺼졌는지 먼저 봐서 요청 수 제한도 안 걸리게 (꺼진 경로는 흔적 없이)
const skipWhenDisabled = ({ env = process.env } = {}) => (req, res, next) => (
    readConfiguredKey(env) ? next() : next('router')
);

module.exports = { MIN_KEY_LENGTH, HEADER_NAME, readConfiguredKey, keysMatch, requireInternalKey, skipWhenDisabled };
