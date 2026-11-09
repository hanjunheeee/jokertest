'use strict';

// 소셜 시험 도우미 파일, 가입 의도·state를 시험 DB에 바로 넣고 시도 쿠키·만료 access를 시험 비밀키로 서명
// tests/auth/social-*·refresh, tests/mobile/social-signup 시험이 씀 — 제공자(Google·Discord) 왕복 대신 그 뒤 상태를 만듦 (시험 파일 아님)
const crypto = require('node:crypto');
const path = require('node:path');
const { E2E, BACKEND_DIR, readSecrets } = require('../../helpers/env');
const { backend, query } = require('../../helpers/db');
const { RUN_ID } = require('../../helpers/accounts');

// 백엔드와 같은 jwt 꾸러미 (서명 모양이 서버와 똑같게)
const jwt = require(path.join(BACKEND_DIR, 'node_modules', 'jsonwebtoken'));

// 서버 tokens.js와 같은 규칙: 무작위 토큰 · DB엔 sha256 해시만
const opaque = () => crypto.randomBytes(32).toString('base64url');
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// 이번 실행에서 만든 줄 (시험 끝에 지우기용)
const made = { intentHashes: [], stateHashes: [] };

// 제공자 쪽 고유 번호 (이번 실행 표시 붙임)
const newSubject = () => `e2e-${RUN_ID}-${crypto.randomBytes(6).toString('hex')}`;

/**
 * 시도 쿠키 값 서명 (서버 attempt.js signOAuthAttempt와 같음)
 * @param {object} payload 예: { intentToken, rememberMe, purpose:'signup', provider:'google' }
 */
const signAttempt = (payload, ttlSeconds = 600) => jwt.sign(payload, readSecrets().JWT_SECRET, { expiresIn: ttlSeconds });

/** 브라우저에 시도 쿠키 넣기 (서버가 주는 것과 같은 이름·httpOnly·Lax) */
async function setAttemptCookie(context, value) {
    await context.addCookies([{ name: 'oauthAttempt', value, url: E2E.apiUrl, httpOnly: true, sameSite: 'Lax' }]);
}

/**
 * 가입 의도 한 줄 넣기 (서버 resolve.js가 새 소셜 계정을 만났을 때와 같은 모양)
 * @param {object} [o]
 * @param {'google'|'discord'} [o.provider='google']
 * @param {string|null} [o.email=null] 제공자가 확인해 준 이메일 (null이면 가입 때 이메일 인증)
 * @param {number} [o.ttlMs=30분]
 * @returns {Promise<{ intentToken:string, subject:string, provider:string }>}
 */
async function seedIntent({ provider = 'google', email = null, ttlMs = 30 * 60 * 1000 } = {}) {
    const { userRepository } = backend();
    const intentToken = opaque();
    const subject = newSubject();
    const hash = sha256(intentToken);
    made.intentHashes.push(hash);
    await userRepository.createSocialSignupIntent({
        intent_token_hash: hash, provider, subject, email, expires_at: new Date(Date.now() + ttlMs),
    });
    return { intentToken, subject, provider };
}

/**
 * 가입 의도 + 이 브라우저 가입 시도 쿠키 (콜백이 SIGNUP_REQUIRED로 보낸 직후 상태)
 * @returns {Promise<{ intentToken:string, subject:string, provider:string }>}
 */
async function prepareSocialSignup(context, { provider = 'google', email = null, rememberMe = false } = {}) {
    const intent = await seedIntent({ provider, email });
    await setAttemptCookie(context, signAttempt({ intentToken: intent.intentToken, rememberMe, purpose: 'signup', provider }, 30 * 60));
    return intent;
}

/**
 * state 한 줄 넣기 (서버 state.js issueOAuthState와 같은 모양)
 * @param {object} [o]
 * @param {'login'|'link'} [o.purpose='login']
 * @param {string|null} [o.userId] 연결이면 계정 uuid
 * @param {string|null} [o.sessionId] 연결이면 세션 id
 * @param {number} [o.ttlMs=10분] 음수면 이미 만료
 * @returns {Promise<{ state:string, fp:string }>} state 원문 · 브라우저 지문 원문
 */
async function seedState({ purpose = 'login', userId = null, sessionId = null, ttlMs = 10 * 60 * 1000 } = {}) {
    const { userRepository } = backend();
    const state = opaque();
    const fp = opaque();
    const hash = sha256(state);
    made.stateHashes.push(hash);
    await userRepository.createOAuthState({
        state_hash: hash,
        purpose,
        user_id: purpose === 'link' ? userId : null,
        session_id: purpose === 'link' ? sessionId : null,
        browser_fingerprint_hash: sha256(fp),
        expires_at: new Date(Date.now() + ttlMs),
    });
    return { state, fp };
}

/** 로그인 시작을 마친 브라우저 (state + 같은 지문의 시도 쿠키), client:'mobile'이면 모바일 시작 */
async function prepareLoginAttempt(context, { provider = 'google', rememberMe = false, client } = {}) {
    const seeded = await seedState({ purpose: 'login' });
    const mark = client === 'mobile' ? { client: 'mobile' } : {};
    await setAttemptCookie(context, signAttempt({ fp: seeded.fp, rememberMe, purpose: 'login', provider, ...mark }));
    return seeded;
}

/** 콜백 주소 (제공자가 돌려보내는 모양) */
const callbackUrl = (route, params) => `${E2E.apiUrl}/auth/${route}?${new URLSearchParams(params).toString()}`;

/** 브라우저 access 쿠키 속 값 (uuid·sessionId) — 서명 확인 없이 풀기만 */
async function accessPayload(context) {
    const cookie = (await context.cookies(E2E.apiUrl)).find((c) => c.name === 'accessToken');
    return cookie ? jwt.decode(cookie.value) : null;
}

/** 지금 access를 같은 내용·이미 지난 만료 시각으로 다시 서명해 바꿔 넣음 (access 끝난 상태 만들기) */
async function expireAccessCookie(context) {
    const cookie = (await context.cookies(E2E.apiUrl)).find((c) => c.name === 'accessToken');
    if (!cookie) throw new Error('access 쿠키 없음');
    const { iat, exp, ...payload } = jwt.decode(cookie.value);
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign({ ...payload, iat: now - 120, exp: now - 60 }, readSecrets().JWT_SECRET);
    await context.addCookies([{ ...cookie, value: expired }]);
    return expired;
}

/** state 한 줄 (확인용) */
async function stateRow(state) {
    const [row] = await query('SELECT consumed_at FROM oauth_states WHERE state_hash = ?', [sha256(state)]);
    return row ?? null;
}

/** 가입 의도 한 줄 (확인용) */
async function intentRow(intentToken) {
    const [row] = await query('SELECT consumed_at FROM social_signup_intents WHERE intent_token_hash = ?', [sha256(intentToken)]);
    return row ?? null;
}

/** 이 프로세스가 넣은 state·가입 의도 줄 지우기 (afterAll에서) */
async function cleanupSeeded() {
    if (made.stateHashes.length > 0) {
        await query(`DELETE FROM oauth_states WHERE state_hash IN (${made.stateHashes.map(() => '?').join(',')})`, made.stateHashes);
    }
    if (made.intentHashes.length > 0) {
        await query(`DELETE FROM social_signup_intents WHERE intent_token_hash IN (${made.intentHashes.map(() => '?').join(',')})`, made.intentHashes);
    }
    made.stateHashes = [];
    made.intentHashes = [];
}

module.exports = {
    signAttempt, setAttemptCookie, seedIntent, prepareSocialSignup, seedState, prepareLoginAttempt,
    callbackUrl, accessPayload, expireAccessCookie, stateRow, intentRow, cleanupSeeded, newSubject,
};
