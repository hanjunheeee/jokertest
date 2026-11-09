'use strict';

// 로그인·가입 시험 도우미 파일, 가입 칸 채우기·이메일 인증·약관 동의·로그인 칸 채우기
// tests/auth 시험들이 씀 (시험 파일 아님 — 이름에 .spec 없음)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { RUN_ID, EMAIL_DOMAIN, randomNickname } = require('../../helpers/accounts');
const mail = require('../../helpers/mail');

// 화면으로 가입할 새 주소 (실행 끝 정리 모양 e2e+<실행 번호>-…@example.test 안에서)
const newEmail = (tag = 'su') => `e2e+${RUN_ID}-${tag}${crypto.randomBytes(5).toString('hex')}${EMAIL_DOMAIN}`;
// 가입 규칙 안 닉네임 (8자)
const newNickname = (prefix = 's') => randomNickname(prefix);
const newPassword = () => `Su!${crypto.randomBytes(9).toString('base64url')}7z`;

// 오늘에서 years년 + days일 전 날짜 (YYYY-MM-DD, 한국 날짜 기준)
function birthDateYearsAgo(years, days = 0) {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const d = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() - days));
    return d.toISOString().slice(0, 10);
}

const loginButton = (page) => page.getByRole('button', { name: '로그인', exact: true });
const emailBox = (page) => page.getByRole('textbox', { name: '이메일을 입력하세요' });
const passwordBox = (page) => page.getByRole('textbox', { name: '비밀번호를 입력하세요' });

// 로그인 칸 채우기 (누르진 않음)
async function fillLogin(page, email, password) {
    await page.goto('/login');
    await emailBox(page).fill(email);
    await passwordBox(page).fill(password);
}

/**
 * 알림 문구 받기 — 뜨자마자 바로 닫음
 * (ui.captureAlert는 누르기가 끝난 뒤 닫아서, 응답이 빨라 누르는 중에 알림이 뜨면 click이 안 끝나고 멈춤)
 */
async function quickAlert(page, action, { timeoutMs = 10000 } = {}) {
    const got = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { page.off('dialog', onDialog); reject(new Error('알림 안 뜸')); }, timeoutMs);
        function onDialog(dialog) {
            clearTimeout(timer);
            page.off('dialog', onDialog);
            const message = dialog.message();
            dialog.accept().catch(() => {}).finally(() => resolve(message));
        }
        page.on('dialog', onDialog);
    });
    await action();
    return got;
}

// 로그인 누르고 뜬 알림 문구 받기
async function loginAlert(page, email, password) {
    await fillLogin(page, email, password);
    return quickAlert(page, () => loginButton(page).click());
}

// 가입 모드 열기
async function openSignup(page) {
    await page.goto('/login');
    await page.getByRole('button', { name: '회원가입' }).click();
    await expect(page.getByRole('region', { name: '회원가입 입력' })).toBeVisible();
    await expect(page.getByRole('group', { name: '약관 동의' })).toBeVisible();
}

// 가입 칸 채우기 (넘긴 칸만)
async function fillSignup(page, { email, password, passwordConfirm, nickname, birthDate } = {}) {
    const area = page.getByRole('region', { name: '회원가입 입력' });
    if (email !== undefined) await area.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
    if (password !== undefined) await area.getByRole('textbox', { name: '비밀번호를 입력하세요' }).fill(password);
    if (passwordConfirm !== undefined) await area.getByRole('textbox', { name: '비밀번호를 다시 입력하세요' }).fill(passwordConfirm);
    if (nickname !== undefined) await area.getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ }).fill(nickname);
    if (birthDate !== undefined) await area.getByRole('textbox', { name: '생년월일을 선택하세요' }).fill(birthDate);
}

const sendCodeButton = (page) => page.getByTestId('signup-code-send');
const codeBox = (page) => page.getByRole('textbox', { name: '인증번호를 입력하세요' });
const verifyButton = (page) => page.getByTestId('signup-code-verify');
const verifyNotice = (page) => page.getByTestId('signup-email-verification-notice');

// 인증번호 받기 → 메일 속 번호 (since 뒤에 온 것)
async function requestCode(page, email) {
    const since = Date.now() - 1000;
    await sendCodeButton(page).click();
    await expect(sendCodeButton(page)).toHaveText(/재발송/);
    return mail.waitForCode(email, 'SIGNUP_CODE', { since });
}

// 번호 넣고 확인
async function enterCode(page, code) {
    await codeBox(page).fill(code);
    await verifyButton(page).click();
}

// 이메일 칸 채우고 인증 끝까지
async function verifyEmail(page, email) {
    await fillSignup(page, { email });
    const code = await requestCode(page, email);
    await enterCode(page, code);
    await expect(verifyNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
}

const termsGroup = (page) => page.getByRole('group', { name: '약관 동의' });
async function agreeAll(page) {
    const all = termsGroup(page).getByRole('checkbox', { name: '전체 동의' });
    await all.click();
    await expect(all).toHaveAttribute('aria-checked', 'true');
}

const signupButton = (page) => page.getByRole('button', { name: '회원가입', exact: true }).last();
/**
 * 가입 보내고 뜬 알림 문구
 * 1280×800에서 회원가입 버튼 칸 높이가 0으로 접혀 버튼이 안 보이고 못 누름 (문제목록/auth.md 1번)
 * → 가입 칸 규칙 시험들은 닉네임 칸에서 Enter(같은 form 제출)로 보냄, 버튼 자체는 signup-form '회원가입 버튼' 시험이 봄
 */
async function submitSignup(page) {
    const nickname = page.getByRole('region', { name: '회원가입 입력' }).getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ });
    return quickAlert(page, () => nickname.press('Enter'));
}

// 다 맞는 값 + 인증 + 약관까지 (overrides로 칸 하나만 바꿔 실패 경우 만들기)
async function prepareValidSignup(page, overrides = {}) {
    const email = overrides.email ?? newEmail();
    const password = overrides.password ?? newPassword();
    const values = {
        email,
        password,
        passwordConfirm: overrides.passwordConfirm ?? password,
        nickname: overrides.nickname ?? newNickname(),
        birthDate: overrides.birthDate ?? '2000-01-01',
    };
    await openSignup(page);
    await verifyEmail(page, email);
    await fillSignup(page, { ...values, email: undefined });
    if (overrides.agree !== false) await agreeAll(page);
    return values;
}

module.exports = {
    quickAlert, newEmail, newNickname, newPassword, birthDateYearsAgo,
    loginButton, emailBox, passwordBox, fillLogin, loginAlert,
    openSignup, fillSignup, sendCodeButton, codeBox, verifyButton, verifyNotice, requestCode, enterCode, verifyEmail,
    termsGroup, agreeAll, signupButton, submitSignup, prepareValidSignup,
};
