'use strict';

// 문 1 서버 확인 파일, 클라우드플레어 Access 표(Cf-Access-Jwt-Assertion)를 팀 공개키로 검증하고 이메일 꺼냄
// access.middleware.js가 요청마다 부름, 공개키는 Node마다 1시간 보관 (모르는 kid면 1분에 한 번까지 다시 받음)
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const { createError } = require('../../../utils/appError');
const { accessSettings } = require('../../config');

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

const denied = () => createError('관리자 확인을 먼저 거쳐야 해요.', 403, 'ADMIN_ACCESS_REQUIRED');
const unavailable = () => createError('관리자 확인 서버에 닿지 못했어요. 잠시 뒤 다시 해 주세요.', 503, 'ADMIN_ACCESS_UNAVAILABLE');

// 공개키 묶음 → kid별 공개키 (RSA만, 이상한 줄은 건너뜀)
// 예) { keys:[{ kid:'k1', kty:'RSA', n, e }] } → Map { 'k1' → 공개키 }
const keysFromCerts = (body) => {
    const keys = new Map();
    for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
        if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
        try {
            keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
        } catch {
            // 깨진 열쇠 하나 때문에 전부 못 쓰게 하지 않음
        }
    }
    return keys;
};

// 표 머리에서 kid 꺼내기, RS256 아니거나 kid 없으면 403
const tokenKid = (token) => {
    const decoded = typeof token === 'string' ? jwt.decode(token, { complete: true }) : null;
    const kid = decoded?.header?.kid;
    if (decoded?.header?.alg !== 'RS256' || typeof kid !== 'string') throw denied();
    return kid;
};

// 공개키로 서명·aud·발급처 확인 → { email(소문자), claims }, 틀리거나 이메일 없으면 403
const verifiedEmail = (token, key, { aud, issuer }) => {
    let claims;
    try {
        claims = jwt.verify(token, key, { algorithms: ['RS256'], audience: aud, issuer });
    } catch {
        throw denied();
    }
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email) throw denied();
    return { email, claims };
};

// 확인기 하나 만들기 (시험은 now·fetchImpl을 넣음)
const createAccessVerifier = ({
    issuer, aud, certsUrl, fetchImpl = fetch, now = Date.now,
    cacheMs = HOUR_MS, refetchGapMs = MINUTE_MS, timeoutMs = FETCH_TIMEOUT_MS,
}) => {
    let keys = null;
    let fetchedAt = 0;
    let lastTryAt = -Infinity;
    let inflight = null;

    const download = async () => {
        const res = await fetchImpl(certsUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`공개키 받기 실패 ${res.status}`);
        const fresh = keysFromCerts(await res.json());
        if (fresh.size === 0) throw new Error('공개키 없음');
        keys = fresh;
        fetchedAt = now();
    };

    // 동시에 여러 요청이 와도 받기는 한 번
    const refresh = () => {
        if (!inflight) {
            lastTryAt = now();
            inflight = download().finally(() => { inflight = null; });
        }
        return inflight;
    };

    // 보관본 없음 → 늘 받아 봄 / 있음 → 오래됐거나 모르는 kid일 때 1분 간격으로만
    const keyFor = async (kid) => {
        const stale = keys && now() - fetchedAt >= cacheMs;
        const unknown = keys && !keys.has(kid);
        const mayRetry = now() - lastTryAt >= refetchGapMs;
        if (!keys || ((stale || unknown) && mayRetry)) {
            try {
                await refresh();
            } catch {
                if (!keys) throw unavailable();
            }
        }
        return keys.get(kid) ?? null;
    };

    // 표 검증 → { email(소문자), claims }, 틀리면 403 / 공개키 못 받으면 503
    const verify = async (token) => {
        const kid = tokenKid(token);
        const key = await keyFor(kid);
        if (!key) throw denied();
        return verifiedEmail(token, key, { aud, issuer });
    };

    return { verify };
};

// 지금 환경값으로 만든 확인기 하나 (값이 바뀌면 새로, 공개키 보관본도 새로)
let current = { signature: null, verifier: null };

const verifyAccessToken = (token, env = process.env) => {
    const settings = accessSettings(env);
    if (!settings) return Promise.reject(denied());
    const signature = `${settings.issuer}|${settings.aud}|${settings.certsUrl}`;
    if (current.signature !== signature) current = { signature, verifier: createAccessVerifier(settings) };
    return current.verifier.verify(token);
};

module.exports = { createAccessVerifier, verifyAccessToken };
