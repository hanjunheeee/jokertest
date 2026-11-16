'use strict';

// A11a 가입·로그인·세션·소셜 브라우저 시험 도우미 파일, PC·모바일 둘 다 되는 가입 칸 채우기·DB로 시각 옮기기·가짜 제공자 서버 띄우기
// tests/auth/a11-*.spec.js·tests/mobile/a11-auth.spec.js(A11a 몫)만 씀 — 공용 도우미는 안 고치고 여기에 작게 둠
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { E2E } = require('../../helpers/env');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const mail = require('../../helpers/mail');
const servers = require('../../helpers/servers');
const { decodePng, contrastRatio } = require('../../helpers/visible');
const { startFakeOAuth } = require('./fakeOAuth');
const { newEmail, newNickname, birthDateYearsAgo } = require('./authHelpers');

// 누가 봐도 시험용인 비번 (길이만 맞춤) — 8자 'testpass', 그 뒤는 숫자
const testPw = (len) => ('testpass' + '1234567890'.repeat(7)).slice(0, len);
// 한글 비번 (한 글자 3바이트) — 24자 72바이트 / 25자 75바이트
const koreanPw = (len) => '시험비번'.repeat(7).slice(0, len);
// 보통 가입에 쓰는 비번 (12자)
const PW = 'testpass1234';

// ---------- 칸 찾기 (PC·모바일 이름이 다른 곳만 둘 다) ----------
const signupArea = (page) => page.getByRole('region', { name: '회원가입 입력' });
const birthBox = (scope) => scope.getByRole('textbox', { name: /생년월일을 선택하세요|생일 날짜를 선택해주세요/ });
const nicknameBox = (scope) => scope.getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ });
const codeSend = (page) => page.getByTestId('signup-code-send');
const codeInput = (page) => page.getByTestId('signup-code-input');
const codeVerify = (page) => page.getByTestId('signup-code-verify');
const codeNotice = (page) => page.getByTestId('signup-email-verification-notice');
const termsGroup = (page) => page.getByRole('group', { name: '약관 동의' });
const lobbyNav = (page) => page.getByRole('navigation', { name: '로비 메뉴' });
// 가입 모드의 보내기 단추 (가입 모드엔 전환 단추가 "로그인하기"라 이름 겹침 없음)
const signupSubmit = (page) => page.getByRole('button', { name: '회원가입', exact: true });
const pwToggle = (scope) => scope.getByRole('button', { name: /^비밀번호 (보기|숨기기)$/ });

// 가입 모드 열기 (로그인 화면 → "회원가입")
async function openSignup(page) {
    await page.goto('/login');
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(signupArea(page)).toBeVisible();
    await expect(termsGroup(page)).toBeVisible();
}

// 가입 칸 채우기 (넘긴 칸만)
async function fillSignup(page, { email, password, passwordConfirm, nickname, birthDate } = {}) {
    const area = signupArea(page);
    if (email !== undefined) await area.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
    if (password !== undefined) await area.getByPlaceholder('비밀번호를 입력하세요', { exact: true }).fill(password);
    if (passwordConfirm !== undefined) await area.getByPlaceholder('비밀번호를 다시 입력하세요').fill(passwordConfirm);
    if (nickname !== undefined) await nicknameBox(area).fill(nickname);
    if (birthDate !== undefined) await birthBox(area).fill(birthDate);
}

// 인증번호 받기 → 메일 속 번호 (누르기 전 시각 뒤에 온 것)
async function requestCode(page, email) {
    const since = Date.now() - 1000;
    await codeSend(page).click();
    await expect(codeSend(page)).toHaveText(/재발송/);
    return mail.waitForCode(email, 'SIGNUP_CODE', { since });
}

// 번호 넣고 확인
async function enterCode(page, code) {
    await codeInput(page).fill(code);
    await codeVerify(page).click();
}

// 이메일 칸 채우고 인증 끝까지
async function verifyEmail(page, email) {
    await fillSignup(page, { email });
    const code = await requestCode(page, email);
    await enterCode(page, code);
    await expect(codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
}

// 약관 전체 동의 (약관 칸이 다 불러와진 뒤)
async function agreeAll(page) {
    const all = termsGroup(page).getByRole('checkbox', { name: '전체 동의' });
    await all.click();
    await expect(all).toHaveAttribute('aria-checked', 'true');
}

/**
 * 다 맞는 값 + 인증 + 약관까지 (overrides로 칸 하나만 바꿔 실패 경우 만들기)
 * @returns {Promise<{email:string,password:string,passwordConfirm:string,nickname:string,birthDate:string}>}
 */
async function prepareSignup(page, overrides = {}) {
    const email = overrides.email ?? newEmail('a11');
    const password = overrides.password ?? PW;
    const values = {
        email,
        password,
        passwordConfirm: overrides.passwordConfirm ?? password,
        nickname: overrides.nickname ?? newNickname('g'),
        birthDate: overrides.birthDate ?? '2000-01-01',
    };
    await openSignup(page);
    if (overrides.verify !== false) await verifyEmail(page, email);
    else await fillSignup(page, { email });
    await fillSignup(page, { ...values, email: undefined });
    if (overrides.agree !== false) await agreeAll(page);
    return values;
}

// 가입 보내고 뜬 알림 글 (닉네임 칸 Enter = 같은 form 제출), o.close=false면 양피지 창을 안 닫음
// 주의: 가입 단추가 꺼져 있으면 브라우저가 Enter 제출도 막음 (HTML 기본 단추 규칙)
const submitSignupByEnter = (page, o = {}) => ui.captureAlert(page, () => nicknameBox(signupArea(page)).press('Enter'), o);
// 가입 단추 눌러 보내고 뜬 알림 글
const submitSignupByButton = (page, o = {}) => ui.captureAlert(page, () => signupSubmit(page).click(), o);
// 인증 전 가입 단추 아래 안내 줄
const signupHint = (page) => page.getByText('이메일 인증을 완료해야 가입할 수 있습니다.');

// 로그인 칸 채우고 로그인 누름 → 뜬 알림 글 (PC 브라우저 알림·모바일 양피지 창 둘 다)
async function loginAlert(page, email, password, { close = true } = {}) {
    await page.goto('/login');
    await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
    await page.getByPlaceholder('비밀번호를 입력하세요', { exact: true }).fill(password);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click(), { close });
}

// 화면으로 로그인 → 로비 화면까지 (remember = 로그인 상태 유지)
async function loginToLobby(page, account, { remember = false } = {}) {
    await ui.loginViaUi(page, account, { remember });
    await ui.skipIntro(page);
    await expect(lobbyNav(page)).toBeVisible();
}

// 로비 "종료"로 로그아웃 → 로그인 화면
async function logoutViaMenu(page) {
    await ui.skipIntro(page);
    await lobbyNav(page).getByRole('button', { name: '종료' }).click();
    await expect(page).toHaveURL(/\/login$/);
}

// ---------- 요청 세기·쿠키 ----------

// 이 주소로 간 요청 목록 (경로가 딱 맞는 것만, 예: '/auth/signup' — '/auth/signup/email-code'는 안 셈)
function trackRequests(page, pathname) {
    const hits = [];
    page.on('request', (req) => {
        const url = new URL(req.url());
        if (url.origin === E2E.apiUrl && url.pathname === pathname) hits.push(req.method());
    });
    return hits;
}

// API 주소의 쿠키 이름 목록
const cookieNames = async (context) => (await context.cookies(E2E.apiUrl)).map((c) => c.name);

// "브라우저 닫았다 열기": 저장 상태에서 세션 쿠키(끝 시각 없는 것)만 버림, 화면 저장값은 그대로
const dropSessionCookies = (state) => ({ ...state, cookies: state.cookies.filter((c) => c.expires > 0) });

// ---------- DB로 상태 만들기 (시험 DB joker_e2e만) ----------

// 정지 줄 넣기 (지금부터 하루)
async function banUser(uuid, reason) {
    const now = Date.now();
    await db.query(
        'INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, ?, ?, ?)',
        [uuid, reason, new Date(now - 3600_000), new Date(now + 86_400_000), new Date(now)],
    );
}

// 정지 풀기 (관리자 해제와 같은 모양: 끝 시각 지금·영구 아님·해제 시각)
async function liftBan(uuid) {
    const now = new Date();
    await db.query('UPDATE user_bans SET end_at = ?, is_permanent = 0, lifted_at = ? WHERE user_id = ? AND lifted_at IS NULL', [now, now, uuid]);
}

// 잠금 끝 시각을 지난 시각으로
const unlockByTime = (uuid) => db.query('UPDATE users SET locked_until = ? WHERE uuid = ?', [new Date(Date.now() - 1000), uuid]);

// 인증번호 끝 시각을 지난 시각으로
const expireSignupCode = (email) => db.query(
    "UPDATE signup_email_verifications SET code_expires_at = ? WHERE email = ? AND purpose = 'SIGNUP'",
    [new Date(Date.now() - 1000), email.toLowerCase()],
);

// 인증번호 보낸 시각을 sec초 앞으로 (다시 보내기 대기를 서버 쪽에서 끝냄)
const shiftSignupSentAt = (email, sec) => db.query(
    "UPDATE signup_email_verifications SET sent_at = DATE_SUB(sent_at, INTERVAL ? SECOND) WHERE email = ? AND purpose = 'SIGNUP'",
    [sec, email.toLowerCase()],
);

// 그 사람 세션 refresh 끝 시각을 지난 시각으로 (로그인 유지 30일 끝)
const expireRefresh = (uuid) => db.query(
    'UPDATE user_sessions SET refresh_token_expires_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [new Date(Date.now() - 1000), uuid],
);

// 그 사람의 살아 있는 세션 수
async function liveSessionCount(uuid) {
    const [row] = await db.query('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL', [uuid]);
    return Number(row.n);
}

// 이메일로 계정 uuid (없으면 null)
async function uuidOfEmail(email) {
    const [row] = await db.query('SELECT uuid FROM users WHERE email = ?', [email.toLowerCase()]);
    return row?.uuid ?? null;
}

// ---------- 보임 ----------

/**
 * 그림 단추(비번 보기 눈 그림)의 둘레 그림 대비 — 단추 사진에서 바탕(가운데값)과 가장 다른 점의 대비
 * 글자가 없어 expectReadable 대비를 못 셈 → 그림 대비(웹 접근성 기준 3 이상)를 따로 봄
 * @returns {Promise<number>} 대비 (1~21)
 */
async function iconContrast(locator) {
    await locator.scrollIntoViewIfNeeded();
    const { pixels, bpp } = decodePng(await locator.screenshot({ animations: 'disabled', caret: 'hide' }));
    const rs = []; const gs = []; const bs = [];
    for (let i = 0; i < pixels.length; i += bpp) { rs.push(pixels[i]); gs.push(pixels[i + 1]); bs.push(pixels[i + 2]); }
    const mid = (list) => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)];
    const background = { r: mid(rs), g: mid(gs), b: mid(bs), a: 1 };
    let best = 1;
    for (let i = 0; i < rs.length; i += 1) {
        best = Math.max(best, contrastRatio({ r: rs[i], g: gs[i], b: bs[i], a: 1 }, background));
    }
    return Math.round(best * 100) / 100;
}

// ---------- 가짜 Google·Discord + 그 제공자를 보는 따로 띄운 백엔드 ----------

// 작업자마다 다른 포트 (따로 띄운 백엔드 4170~4177, 가짜 제공자 4180~4187 — 4100~4102·4150~4157·4179 안 씀)
const socialPorts = (parallelIndex) => {
    const n = parallelIndex % 8;
    return { n, api: 4170 + n, fake: 4180 + n };
};

// 따로 띄운 백엔드 환경값 (시험 키 값은 가짜, 돌아올 주소는 그 백엔드)
const providerEnv = (apiUrl, fakeUrl) => ({
    GOOGLE_CLIENT_ID: 'e2e-google-client',
    GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
    GOOGLE_REDIRECT_URI: `${apiUrl}/auth/google/callback`,
    GOOGLE_OAUTH_BASE_URL: fakeUrl,
    DISCORD_CLIENT_ID: 'e2e-discord-client',
    DISCORD_CLIENT_SECRET: 'e2e-discord-secret',
    DISCORD_REDIRECT_URI: `${apiUrl}/auth/discord/callback`,
    DISCORD_LINK_REDIRECT_URI: `${apiUrl}/auth/discord/link/callback`,
    DISCORD_OAUTH_BASE_URL: fakeUrl,
});

/**
 * 가짜 제공자 + 그 주소를 쓰는 백엔드 띄우기 (본 서버 4100엔 소셜 키가 없어서)
 * 쿠키는 포트를 안 가려 따로 띄운 백엔드가 준 로그인 쿠키를 화면(→4100)이 그대로 씀
 * @returns {Promise<{ api:{url:string}, fake:{next:Function}, stop:()=>Promise<void> }>}
 */
async function startSocial(parallelIndex) {
    const ports = socialPorts(parallelIndex);
    const fake = await startFakeOAuth(ports.fake);
    let api = null;
    try {
        api = await servers.startExtraBackend({
            port: ports.api,
            defaultIpLimits: false,
            timeoutMs: 150_000,
            overrides: { SERVER_ID: `e2e-a11a-social-${ports.n}`, ...providerEnv(`http://localhost:${ports.api}`, fake.url) },
        });
    } catch (error) {
        await fake.close();
        throw error;
    }
    return {
        api,
        fake,
        stop: async () => { await api.stop().catch(() => {}); await fake.close().catch(() => {}); },
    };
}

// 제공자 쪽 고유 번호 (시험마다 새로)
const newSubject = () => `e2e-a11a-${crypto.randomBytes(6).toString('hex')}`;

// 제공자가 돌려줄 사람 모양 (Google { sub, email, email_verified } / Discord { id, email, verified })
const providerPerson = (provider, { subject, email, verified = true }) => (provider === 'google'
    ? { sub: subject, email, email_verified: verified }
    : { id: subject, email, verified });

// 계정에 소셜 계정 붙이기 (예전에 소셜로 가입·연결해 둔 상태)
async function linkIdentity(account, provider, subject) {
    await db.backend().userRepository.createExternalIdentity({ provider, subject, user_id: account.uuid, email_snapshot: null });
}

// 소셜 로그인 시작 주소 (따로 띄운 백엔드) — mobile이면 모바일 화면으로 돌아옴
const socialStart = (social, provider, { rememberMe = false, mobile = false } = {}) => {
    const params = new URLSearchParams({ rememberMe: String(rememberMe), ...(mobile ? { client: 'mobile' } : {}) });
    return `${social.api.url}/auth/${provider}?${params.toString()}`;
};

// 소셜 가입 칸 채우고 "가입 완료" (닉네임·생일·약관)
async function completeSocialSignup(page, { nickname = newNickname('o'), birthDate = '2000-01-01' } = {}) {
    await nicknameBox(page).fill(nickname);
    await birthBox(page).fill(birthDate);
    await agreeAll(page);
    await page.getByRole('button', { name: '가입 완료' }).click();
    return { nickname, birthDate };
}

module.exports = {
    testPw, koreanPw, PW, newEmail, newNickname, birthDateYearsAgo,
    signupArea, birthBox, nicknameBox, codeSend, codeInput, codeVerify, codeNotice, termsGroup, lobbyNav, signupSubmit, pwToggle,
    openSignup, fillSignup, requestCode, enterCode, verifyEmail, agreeAll, prepareSignup, submitSignupByEnter, submitSignupByButton, signupHint,
    loginAlert, loginToLobby, logoutViaMenu,
    trackRequests, cookieNames, dropSessionCookies,
    banUser, liftBan, unlockByTime, expireSignupCode, shiftSignupSentAt, expireRefresh, liveSessionCount, uuidOfEmail,
    iconContrast,
    startSocial, newSubject, providerPerson, linkIdentity, socialStart, completeSocialSignup,
};
