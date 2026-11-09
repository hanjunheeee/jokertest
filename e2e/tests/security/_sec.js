'use strict';

// 보안 파트 공용 도구 파일, API 직접 부르기(쿠키 실어)·토큰 만들기(시험 키)·보안 파트 전용 따로 띄우는 백엔드(4190~4199)
// tests/security/*.spec.js만 씀 (시험 파일 아님: 이름이 .spec.js가 아니라 Playwright가 안 돌림)
const path = require('node:path');
const { E2E, BACKEND_DIR, readSecrets } = require('../../helpers/env');
const sec = require('../../helpers/security');
const servers = require('../../helpers/servers');
const db = require('../../helpers/db');
const { sleep } = require('../../helpers/wait');

const jwt = require(path.join(BACKEND_DIR, 'node_modules', 'jsonwebtoken'));

/** API 부르기 → { status, headers, setCookies, body(글자), json } */
async function api(method, pathname, { cookie, body, headers = {}, base = E2E.apiUrl, raw } = {}) {
    const init = { method, headers: { ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
        init.headers['content-type'] = init.headers['content-type'] ?? 'application/json';
        init.body = JSON.stringify(body);
    }
    const res = await sec.readResponse(`${base}${pathname}`, init);
    let json = null;
    try { json = JSON.parse(res.body); } catch { /* 글자 */ }
    return { ...res, json };
}

/** 로그인해서 accessToken 쿠키 줄 (500이면 몇 번 다시 — 새 계정 동시 첫 로그인 교착, 알려진 문제) */
async function login(account, { base = E2E.apiUrl, rememberMe = false } = {}) {
    for (let attempt = 1; ; attempt += 1) {
        const r = await api('POST', '/auth/login', { base, body: { email: account.email, password: account.password, rememberMe } });
        if (r.status === 200) {
            const pairs = r.setCookies.map((l) => l.split(';')[0]);
            const access = pairs.find((p) => p.startsWith('accessToken='));
            const refresh = pairs.find((p) => p.startsWith('refreshToken='));
            return { cookie: access, refresh, both: [access, refresh].filter(Boolean).join('; '), uuid: r.json?.data?.user?.uuid };
        }
        if (r.status < 500 || attempt >= 4) throw new Error(`로그인 실패 ${r.status}`);
        await sleep(200 * attempt);
    }
}

/** 시험 키로 서명한 토큰 (서버가 받는 모양 확인용, 값은 안 찍음) */
function signToken(payload, options = {}, secret = readSecrets().JWT_SECRET) {
    return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

/** 지금 쿠키 토큰 속 값 (서명 확인 없이 읽기만) */
function decodeCookie(cookie) {
    return jwt.decode(String(cookie).replace(/^accessToken=/, ''));
}

/** 서명 없는 토큰 (alg none) — 서버가 거절하는지만 봄 */
function unsignedToken(payload) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

// 보안 파트 전용 포트 (감독이 정함: 4190~4199, 다른 파트는 안 씀)
const SEC_PORTS = [4190, 4191, 4192, 4193, 4194, 4195, 4196, 4197, 4198, 4199];

/**
 * 따로 띄우는 백엔드 (같은 시험 DB, API·소켓만): n은 0~9 (포트 4190+n, SERVER_ID e2e-sec-n)
 * 한 파일 안에서만 순서대로 씀 (켤 때 접속 표 정리가 다른 시험 줄에 닿을 수 있어 횟수 줄임 — 문제목록 S-01)
 */
// PC가 바쁘면 백엔드 모듈 불러오기만 수십 초 걸림 → 못 켜지면 남는 포트(n+5)로 한 번 더
async function startSec(n, { overrides = {}, defaultIpLimits = true, expectExit = false, timeoutMs = 150000 } = {}) {
    const attempt = (i) => servers.startExtraBackend({
        port: SEC_PORTS[i], defaultIpLimits, expectExit, timeoutMs, overrides: { SERVER_ID: `e2e-sec-${i}`, ...overrides },
    });
    if (expectExit) return attempt(n);
    try {
        return await attempt(n);
    } catch (error) {
        if (!/안 켜짐/.test(String(error?.message))) throw error;
        console.warn(`[e2e-sec] 따로 띄운 백엔드 ${SEC_PORTS[n]} 늦음 → ${SEC_PORTS[n + 5]}로 다시`);
        return attempt(n + 5);
    }
}

// 운영 설정 (시험 손잡이·메일 파일 빼고)
const PRODUCTION = Object.freeze({
    NODE_ENV: 'production', E2E_HOOKS: undefined, MAIL_TEST_OUTBOX_DIR: undefined, E2E_SHUTDOWN_FLAG: undefined, GAME_DEV_MIN_PLAYERS: undefined,
});

// 시험 프로세스의 DB 연결은 JS Date를 +9시간으로 적음(개발 설정 timezone) — 백엔드는 그 값을 그대로 읽어
// 시각이 어긋남. 그래서 시각은 JS Date 말고 DB 시계(NOW()·INTERVAL)로 적음.
/** 정지 줄 넣기 (시작 1분 전, 끝 기본 하루 뒤, DB 시계로) */
async function ban(uuid, { reason = '시험 정지', permanent = false, endHours = 24 } = {}) {
    const endExpr = permanent ? 'NULL' : `NOW() + INTERVAL ${Number(endHours)} HOUR`;
    await db.query(
        `INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, ?, NOW() - INTERVAL 1 MINUTE, ${endExpr}, NOW())`,
        [uuid, reason, permanent ? 1 : 0],
    );
}

/** 지난 정지 줄 (이미 끝남) — DB 시계로 */
async function expiredBan(uuid, { reason = '지난 정지' } = {}) {
    await db.query(
        'INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 1 DAY, NOW())',
        [uuid, reason],
    );
}

/** 계정 잠금 시각을 과거로 (DB 시계로) — 잠금 풀린 뒤 상태 만들기 */
async function setExpiredLock(uuid) {
    await db.query('UPDATE users SET failed_login_count = 5, locked_until = NOW() - INTERVAL 1 MINUTE WHERE uuid = ?', [uuid]);
}

/** 로그인 실패 안내 문구 읽기: 데스크톱은 window.alert, 모바일은 화면 안 alertdialog */
async function loginErrorText(page, account, { password = 'Wrong!pass123', mobile = false } = {}) {
    await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
    await page.getByPlaceholder('비밀번호를 입력하세요').fill(password);
    if (mobile) {
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        const dialog = page.getByRole('alertdialog', { name: '안내' });
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        const text = (await dialog.getByRole('paragraph').allInnerTexts()).join(' ');
        // 다음 시도를 가리지 않게 안내 창을 닫음
        await dialog.getByRole('button', { name: '확인' }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        return text;
    }
    const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 });
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    const dialog = await dialogPromise;
    const message = dialog.message();
    await dialog.accept().catch(() => {});
    return message;
}

const rand = () => Math.random().toString(36).slice(2, 8);

module.exports = { api, login, signToken, decodeCookie, unsignedToken, startSec, PRODUCTION, ban, expiredBan, setExpiredLock, loginErrorText, sleep, rand, sec, db, E2E, readSecrets };
