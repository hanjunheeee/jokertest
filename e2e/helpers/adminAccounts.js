'use strict';

// 관리자 시험 계정 파일, 시험 관리자 만들기(실행 번호 붙음)·OTP 번호·로그인 화면 거쳐 로그인·세션 시각 당기기·실행 끝 지우기
// 관리자 브라우저 시험과 global-setup·global-teardown이 씀 — 계정은 백엔드 계정 명령 함수(createAdminAccount) 그대로 씀
const crypto = require('node:crypto');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { BACKEND_DIR, readSecrets } = require('./env');
const { backend, query } = require('./db');
const { allowAccess } = require('./adminAccess');
const { sleep } = require('./wait');

const RUN_ID = process.env.E2E_RUN_ID || 'local';
// 아이디 앞머리 (지울 때 이 모양만 — 다른 관리자 계정은 절대 안 건드림)
const LOGIN_PREFIX = 'e2e-';
const RUN_LOGIN_LIKE = `${LOGIN_PREFIX}${RUN_ID}-%`;
const ALL_LOGIN_LIKE = `${LOGIN_PREFIX}%`;
const SESSION_COOKIE = 'mmc_admin_sid';
const OTP_STEP_MS = 30_000;

// 계정 명령 함수는 OTP 비밀을 ADMIN_TOTP_KEY로 잠금 → 시험 백엔드와 같은 열쇠를 먼저 넣고 불러옴
function adminBackend() {
    backend();
    const { ADMIN_TOTP_KEY } = readSecrets();
    if (!ADMIN_TOTP_KEY) throw new Error('.env.e2e에 ADMIN_TOTP_KEY가 없음 → e2e 폴더에서 npm run db:setup');
    process.env.ADMIN_TOTP_KEY = ADMIN_TOTP_KEY;
    const req = (rel) => require(path.join(BACKEND_DIR, rel));
    return { accounts: req('admin/scripts/admin-account'), totp: req('admin/services/core/totp') };
}

let counter = 0;
const nextSerial = () => {
    counter += 1;
    const worker = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0';
    return `${worker}x${counter}${crypto.randomBytes(2).toString('hex')}`;
};

/**
 * 시험 관리자 만들기 → { id, loginId, password, totpSecret, email } (실행 끝에 지움)
 * @param {{ email?: string }} [o] 안 주면 실행 번호 붙은 이메일
 */
async function createAdmin({ email } = {}) {
    const serial = nextSerial();
    const loginId = `${LOGIN_PREFIX}${RUN_ID}-${serial}`;
    const password = `E2e-admin-${crypto.randomBytes(9).toString('base64url')}`;
    const made = await adminBackend().accounts.createAdminAccount({
        loginId, password, email: email ?? `e2e-admin-${RUN_ID}-${serial}@example.test`,
    });
    return { id: made.id, loginId, password, totpSecret: made.totpSecret, email: made.email };
}

/** 지금 OTP 번호 6자리 (OTP 앱과 같은 값) */
const otpNow = (secret, nowMs = Date.now()) => adminBackend().totp.codeAt(secret, nowMs);

// 같은 번호는 한 번만 받음 → 이 계정이 이번 30초 칸을 이미 썼으면 다음 칸까지 기다렸다 줌
const usedSteps = new Map();
async function freshOtp(account) {
    let step = Math.floor(Date.now() / OTP_STEP_MS);
    if (usedSteps.get(account.loginId) === step) {
        await sleep((step + 1) * OTP_STEP_MS - Date.now() + 50);
        step = Math.floor(Date.now() / OTP_STEP_MS);
    }
    usedSteps.set(account.loginId, step);
    return otpNow(account.totpSecret);
}

/** 로그인 화면 세 칸 채우기 (누르기는 안 함), otp 안 주면 지금 번호 */
async function fillLogin(page, account, { password = account.password, otp } = {}) {
    await page.getByLabel('아이디', { exact: true }).fill(account.loginId);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('OTP 번호 6자리', { exact: true }).fill(otp ?? await freshOtp(account));
}

/**
 * 화면으로 로그인 (Access 통과 쿠키 → 로그인 화면 → 세 칸 → 로그인), 끝나면 로그인 화면을 벗어나 있음
 * @param {import('@playwright/test').Page} page baseURL이 관리자 주소인 page
 */
async function loginAsAdmin(page, account) {
    await allowAccess(page.context(), account.email);
    await page.goto('/login');
    await fillLogin(page, account);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
}

/**
 * 이 page의 관리자 세션 마지막 활동 시각을 minutes분 전으로 당김 (자동 로그아웃 시험)
 * @returns {Promise<number>} 바뀐 줄 수 (1이어야 함)
 */
async function setAdminSessionIdle(page, minutes) {
    const sid = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE);
    if (!sid) throw new Error('관리자 세션 쿠키가 없음 → loginAsAdmin 먼저');
    const id = crypto.createHash('sha256').update(decodeURIComponent(sid.value)).digest('hex');
    const { db } = backend();
    const [, meta] = await db.sequelize.query(
        'UPDATE admin_sessions SET last_seen_at = UTC_TIMESTAMP() - INTERVAL ? MINUTE WHERE id = ?',
        { replacements: [Number(minutes), id] },
    );
    return meta?.affectedRows ?? 0;
}

// 관리자 계정과 딸린 줄 지우기 (시도·세션·기록·문의 답), 외래키에 막히면 끄기만 하고 경고
async function deleteAdminsWhere(whereSql, replacements) {
    const rows = await query(`SELECT id, login_id FROM admin_users WHERE ${whereSql}`, replacements);
    let removed = 0;
    for (const { id, login_id: loginId } of rows) {
        try {
            await query('DELETE FROM admin_login_attempts WHERE login_id = ? OR admin_id = ?', [loginId, id]);
            for (const table of ['admin_sessions', 'admin_audit_logs', 'inquiry_replies']) await query(`DELETE FROM ${table} WHERE admin_id = ?`, [id]);
            await query('DELETE FROM admin_users WHERE id = ?', [id]);
            removed += 1;
        } catch (error) {
            await query('UPDATE admin_users SET is_active = 0 WHERE id = ?', [id]).catch(() => {});
            console.warn(`[e2e] 관리자 ${loginId} 못 지움 (끄기만): ${String(error?.message ?? error).slice(0, 100)}`);
        }
    }
    return removed;
}

/** 이번 실행 관리자만 지우기 (global-teardown) */
const deleteRunAdmins = () => deleteAdminsWhere('login_id LIKE ?', [RUN_LOGIN_LIKE]);

/** 만든 지 hours시간 넘은 시험 관리자 지우기 (global-setup, 지금 도는 남의 실행 것은 안 건드림) */
const deleteStaleAdmins = (hours = 6) => deleteAdminsWhere(
    'login_id LIKE ? AND created_at < UTC_TIMESTAMP() - INTERVAL ? HOUR', [ALL_LOGIN_LIKE, Number(hours)],
);

module.exports = {
    createAdmin, otpNow, freshOtp, fillLogin, loginAsAdmin, setAdminSessionIdle, deleteRunAdmins, deleteStaleAdmins,
    RUN_LOGIN_LIKE, SESSION_COOKIE,
};
