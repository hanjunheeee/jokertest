'use strict';

// A11b 브라우저 시험 도구 파일, 비번 찾기·아이디 찾기·계정 관리(비번·이메일·탈퇴·닉네임)·마이페이지·판 중 탈퇴 조작 모음
// tests/auth·tests/mypage·tests/mobile의 a11 비번·계정 시험이 씀 (시험 파일 아님 — 이름이 _로 시작)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { E2E } = require('../../helpers/env');
const mail = require('../../helpers/mail');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');
const { expectReadable, readability } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { newEmail, newNickname, quickAlert } = require('./authHelpers');
const { gotoAccount, section } = require('../mypage/account-tools');
const { finishGame, closeReveals, waitResult } = require('../room/roomHelpers/result');

// ── 화면 문구 (frontend/src/domains/auth/constants/recoveryMessages.js·서버 문구 그대로) ──
const TEXT = Object.freeze({
    requestSent: "재설정 요청을 접수했어요. 입력하신 주소로 가입된 계정이 있다면 재설정 링크가 담긴 메일이 도착합니다. 메일이 보이지 않으면 스팸함까지 확인한 뒤 아래 '다시 보내기'를 눌러주세요. 여러 번 요청했다면 가장 최근에 받은 메일의 링크만 쓸 수 있어요.",
    rateLimited: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
    linkExpired: '링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요.',
    linkUsed: '이미 사용된 링크예요. 비밀번호가 이미 재설정되었다면 새 비밀번호로 로그인해주세요.',
    linkInvalid: '유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요.',
    resetDone: '비밀번호가 재설정되었어요. 새 비밀번호로 다시 로그인해주세요.',
    findNotFound: '입력한 정보와 일치하는 계정을 찾을 수 없습니다.',
    passwordRule: '비밀번호는 8~64자여야 합니다.',
    confirmMismatch: '비밀번호 확인이 일치하지 않습니다.',
    loginFailed: '이메일 또는 비밀번호가 일치하지 않습니다.',
    pwChanged: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
    currentPwWrong: '현재 비밀번호가 올바르지 않습니다.',
    currentPwLocked: '현재 비밀번호를 여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요.',
    emailChanged: '이메일이 변경되었습니다.',
    emailInUse: '이미 사용 중인 이메일입니다.',
    withdrawPwWrong: '비밀번호가 올바르지 않습니다.',
    withdrawLocked: '여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요.',
    withdrawEmailMismatch: '계정 이메일을 정확히 입력해주세요.',
    nicknameChanged: '닉네임이 변경되었습니다.',
    nicknameInUse: '이미 사용 중인 닉네임입니다.',
    nicknameLength: '닉네임은 2~8자여야 합니다.',
});

// 탈퇴 확인 창 안내 4줄 (useWithdrawForm.js WITHDRAW_NOTICE_LINES)
const WITHDRAW_NOTICE_LINES = Object.freeze([
    '탈퇴하면 되돌릴 수 없습니다.',
    '가진 골드·다이아·아이템은 모두 사라지고 환불되지 않습니다.',
    '친구·초대 목록은 지워지고, 전적은 이름 없이 남습니다.',
    '같은 이메일로 다시 가입할 수 있지만 새 계정이 됩니다.',
]);

// 마이페이지 단추 순서 (조사 글 버그1)
const MYPAGE_BUTTONS = Object.freeze(['계정 관리', '프로필 수정', '스킨&카드 착용', '이모티콘']);

// ── 시험 값 (누가 봐도 시험용) ──
// 8~64자 규칙 안 새 비번 → 'Test-a11b-1a2b3c4d9'
const testPassword = () => `Test-a11b-${crypto.randomBytes(4).toString('hex')}9`;
// 한 글자 모자란 7자
const SHORT_PASSWORD = 'Test12!';
const WRONG_PASSWORD = 'Test-wrong-pass9';
// 아무 계정도 안 가진 시험 주소 (실행 끝 정리 모양 e2e+<실행 번호>-…@example.test 안)
const freshEmail = (tag = 'b') => newEmail(`a11${tag}`);
// 닉네임 2~8자 안 (8자)
const freshNickname = () => newNickname('n');

// ── 요청 ──
// 그 브라우저 쿠키로 서버 부르기 → { status, body } (실패도 던지지 않음, 거절 확인용)
async function apiCall(context, method, pathname, data) {
    const res = await context.request.fetch(`${E2E.apiUrl}${pathname}`, { method, data, headers: { origin: E2E.desktopUrl } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body };
}

// 그 주소로 가는 POST 응답 기다리는 조건
const isPost = (part) => (r) => r.url().includes(part) && r.request().method() === 'POST';

// 화면이 보낸 요청 세기 (붙인 뒤부터) → counter.count
function countRequests(page, part, method) {
    const seen = [];
    page.on('request', (r) => {
        if (r.url().includes(part) && (!method || r.method() === method)) seen.push(r.url());
    });
    return { get count() { return seen.length; } };
}

// 한 계정에 소켓은 하나라 같은 계정 두 번째 화면이 소켓을 붙이면 앞 화면이 밀려남 → 이 브라우저는 소켓을 안 붙이게 막음
// (밀려나서 로그인 화면으로 가는 것과 이번에 보는 "세션 끊김"이 섞이지 않게)
async function blockSocket(context) {
    await context.routeWebSocket(/\/socket\.io\//, (ws) => { ws.close(); });
}

// ── 메일 ──
// 재설정 링크 (모바일이면 앞 주소만 폰 화면으로)
async function resetLinkFor(email, { since = 0, mobile = false } = {}) {
    const url = await mail.waitForResetUrl(email, { since });
    return mobile ? mail.toMobile(url) : url;
}
const tokenOf = (url) => new URL(url).searchParams.get('token');
const mailsOf = (email, template) => mail.readMails(email).filter((m) => !template || m.template === template);

// 메일이 "안 옴"은 기다려 봐야 앎 → 몇 초 쉬고 0통인지 봄 (온다면 1초 안에 옴, 있는 주소 케이스 기준)
async function expectNoMail(email, template, waitMs = 3000) {
    await sleep(waitMs);
    expect(mailsOf(email, template), `${email}에 ${template ?? '메일'}이 옴`).toHaveLength(0);
}

// ── DB (시험 DB joker_e2e만) ──
// 그 사람 재설정 토큰을 1분 전에 끝난 것으로
async function expireResetTokens(uuid) {
    await db.query('UPDATE password_reset_tokens SET expired_at = ? WHERE user_id = ?', [db.sqlTime(Date.now() - 60_000), uuid]);
}
// 소셜 전용 계정으로 (users.has_local_password = false)
async function makeSocialOnly(uuid) {
    await db.query('UPDATE users SET has_local_password = 0 WHERE uuid = ?', [uuid]);
}

// ── 로그인 ──
// 로그인 칸에 넣고 눌러 뜬 알림 문구 (데스크톱 브라우저 알림)
async function loginFailAlert(page, email, password) {
    await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요', { exact: true }).fill(email);
    await page.getByPlaceholder('비밀번호를 입력하세요', { exact: true }).fill(password);
    return quickAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
}

// 계정 관리 화면엔 로그아웃 단추가 없어서 "로그아웃 뒤"는 쿠키·저장소가 빈 새 브라우저로 봄
const freshBrowser = (players, account) => players.add({ account, login: false });

// 한 사람 한 세션: 같은 계정으로 또 로그인하면 앞 브라우저 세션이 끊김 (backend/services/auth/account/session.js)
// → "같은 세션을 가진 다른 브라우저"는 로그인한 쪽 쿠키를 그대로 옮겨 만듦 (to는 login:false로 연 것)
async function shareSession(from, to) {
    await to.context.addCookies(await from.context.cookies());
}

// ── 비번 찾기·재설정 화면 ──
const RESET_EMAIL_BOX = '가입할 때 등록한 이메일을 입력하세요';
const newPasswordBox = (page) => page.getByPlaceholder('8~64자 비밀번호 (영문·숫자 포함)', { exact: true });
const newPasswordConfirmBox = (page) => page.getByPlaceholder('비밀번호를 다시 입력하세요', { exact: true });

// 요청 화면에서 주소 넣고 보냄 → 응답 상태 번호
async function requestResetUi(page, email, { open = true } = {}) {
    if (open) await page.goto('/password-reset/request');
    await page.getByPlaceholder(RESET_EMAIL_BOX, { exact: true }).fill(email);
    const res = page.waitForResponse(isPost('/auth/password-reset/request'));
    await page.getByRole('button', { name: '재설정 링크 보내기' }).click();
    return (await res).status();
}

// 준비용 재설정 메일 요청 (화면 안 거침)
const requestResetApi = (context, email) => apiCall(context, 'POST', '/auth/password-reset/request', { email });

// 접수 안내 글 (PC는 화면 글, 모바일은 양피지 창 "재설정 요청 접수" 안)
const requestSentNotice = (page, mobile) => (mobile
    ? page.getByRole('dialog', { name: '재설정 요청 접수' }).getByText(TEXT.requestSent, { exact: true })
    : page.getByText(TEXT.requestSent, { exact: true }));

// 링크 열고 새 비번 칸이 나올 때까지 (링크 확인 끝)
async function openResetLink(page, url) {
    await page.goto(url);
    await expect(newPasswordBox(page)).toBeVisible({ timeout: 15_000 });
}

// 새 비번 두 칸 넣고 "비밀번호 변경"
async function submitNewPassword(page, password, confirm = password) {
    await newPasswordBox(page).fill(password);
    await newPasswordConfirmBox(page).fill(confirm);
    await page.getByRole('button', { name: '비밀번호 변경' }).click();
}

// 메일 요청(준비) → 링크 → 새 비번 → 완료 글까지, 쓴 링크 돌려줌
async function resetPasswordVia(page, email, password, { mobile = false } = {}) {
    const since = Date.now() - 1000;
    await requestResetApi(page.context(), email);
    const url = await resetLinkFor(email, { since, mobile });
    await openResetLink(page, url);
    await submitNewPassword(page, password);
    await expect(page.getByText(TEXT.resetDone, { exact: true })).toBeVisible();
    return url;
}

// 비번 칸 옆 눈 그림 단추 (그 칸을 품은 가장 가까운 칸 안 단추)
const eyeButtonOf = (input) => input.locator('xpath=ancestor::div[.//button[starts-with(@aria-label,"비밀번호 ")]][1]//button[starts-with(@aria-label,"비밀번호 ")]');

// 그림 단추: 보임·화면 안·안 가려짐 + 그림색과 바탕 대비 3 이상 (글 없는 단추 기준, 시험_계획 3-6)
async function expectIconReadable(button) {
    await expectReadable(button, { contrast: false });
    const r = await readability(button, { method: 'pixels' });
    expect(r.ratio, `그림 대비 ${r.ratio} (그림 ${r.color}, 바탕 ${r.background})`).toBeGreaterThanOrEqual(3);
}

// 그림 위 글자 단추: 단추가 보이고 안 가려짐 + 글자 대비 (글 칸은 누름이 단추로 가게 해 둬서 가려짐은 단추로 봄)
async function expectLabelReadable(button, label) {
    await expectReadable(button, { contrast: false });
    await expectReadable(button.getByText(label, { exact: true }), { uncovered: false });
}

// 글이 칸 밖으로 잘리지 않음: 글 폭 ≤ 칸 폭, 넘침을 자르는 윗칸 안에 다 들어감
async function expectNotClipped(locator) {
    const r = await locator.evaluate((el) => {
        const box = el.getBoundingClientRect();
        let clipper = null;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.overflowX !== 'visible' || s.overflow !== 'visible') { clipper = n.getBoundingClientRect(); break; }
        }
        return {
            scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
            left: box.left, right: box.right, viewport: window.innerWidth,
            clipLeft: clipper?.left ?? 0, clipRight: clipper?.right ?? window.innerWidth,
        };
    });
    expect(r.scrollWidth, `글 폭 ${r.scrollWidth} > 칸 폭 ${r.clientWidth}`).toBeLessThanOrEqual(r.clientWidth + 1);
    expect(r.left).toBeGreaterThanOrEqual(r.clipLeft - 1);
    expect(r.right).toBeLessThanOrEqual(Math.min(r.clipRight, r.viewport) + 1);
}

// ── 아이디 찾기 ──
const findNicknameBox = (page) => page.getByPlaceholder('닉네임을 입력하세요', { exact: true });
const findBirthBox = (page) => page.locator('input[name="birthDate"]');

// 닉네임·생일 넣고 찾기 → 응답 상태 번호
async function findIdUi(page, { nickname, birthDate = '2000-01-01', open = true }) {
    if (open) await page.goto('/find-id');
    await findNicknameBox(page).fill(nickname);
    await findBirthBox(page).fill(birthDate);
    return submitFindId(page);
}
async function submitFindId(page) {
    const res = page.waitForResponse(isPost('/auth/find-id'));
    await page.getByRole('button', { name: '아이디 찾기', exact: true }).click();
    return (await res).status();
}

// 찾기 결과·실패 글: PC는 화면 글, 모바일 실패는 양피지 안내 창
const foundEmailText = (page) => page.getByRole('status').filter({ hasText: '@' });
const findFailText = (page, text, mobile) => (mobile
    ? page.getByRole('alertdialog', { name: '안내' }).getByText(text, { exact: true })
    : page.getByText(text, { exact: true }));

// ── 계정 관리 ──
const pwSection = (page) => section(page, '비밀번호 변경');
const emailSection = (page) => section(page, '이메일 변경');
const withdrawSection = (page) => section(page, '회원 탈퇴');
const nicknameSection = (page) => section(page, '닉네임 변경');
const currentPwBox = (page) => pwSection(page).getByPlaceholder('현재 비밀번호', { exact: true });

// 비번 바꾸기 칸 채우고 "변경" (누르지 않으려면 submit:false)
async function fillPasswordChange(page, { current, next, confirm = next }) {
    const s = pwSection(page);
    await currentPwBox(page).fill(current);
    await s.getByPlaceholder('새 비밀번호 (8~64자, 영문·숫자 포함)', { exact: true }).fill(next);
    await s.getByPlaceholder('새 비밀번호 확인', { exact: true }).fill(confirm);
    return s.getByRole('button', { name: '변경', exact: true });
}
async function changePasswordUi(page, o) {
    const button = await fillPasswordChange(page, o);
    const res = page.waitForResponse((r) => r.url().includes('/user/me/password') && r.request().method() === 'PATCH');
    await button.click();
    return (await res).status();
}

// 현재 비번을 n번 틀리게 냄 (매번 "현재 비밀번호가 올바르지 않습니다."까지)
async function failCurrentPassword(page, times) {
    for (let i = 0; i < times; i += 1) {
        const status = await changePasswordUi(page, { current: WRONG_PASSWORD, next: testPassword() });
        expect(status, `${i + 1}번째 틀림 응답`).toBe(400);
    }
}

// 이메일 바꾸기: 번호 받기 → (메일 번호) → 확인
async function sendEmailCode(page, { newEmail: to, password }) {
    const s = emailSection(page);
    await s.getByPlaceholder('새 이메일', { exact: true }).fill(to);
    if (password !== undefined) await s.getByPlaceholder('현재 비밀번호', { exact: true }).fill(password);
    const res = page.waitForResponse(isPost('/user/me/email/code'));
    await s.getByRole('button', { name: '번호 받기', exact: true }).click();
    return (await res).status();
}
async function resendEmailCode(page) {
    const res = page.waitForResponse(isPost('/user/me/email/code'));
    await emailSection(page).getByRole('button', { name: '인증번호 다시 받기' }).click();
    return (await res).status();
}
async function confirmEmailCode(page, code) {
    const s = emailSection(page);
    await s.getByPlaceholder('새 이메일로 받은 인증번호', { exact: true }).fill(code);
    const res = page.waitForResponse(isPost('/user/me/email/verify'));
    await s.getByRole('button', { name: '확인', exact: true }).click();
    return (await res).status();
}
// 끝까지 바꿈 → 새 주소
async function changeEmailUi(page, { newEmail: to = freshEmail('ec'), password }) {
    const since = Date.now() - 1000;
    expect(await sendEmailCode(page, { newEmail: to, password })).toBe(200);
    const code = await mail.waitForCode(to, 'EMAIL_CHANGE_CODE', { since });
    expect(await confirmEmailCode(page, code)).toBe(200);
    await expect(emailSection(page).getByText(TEXT.emailChanged, { exact: true })).toBeVisible();
    return to;
}

// 탈퇴: 본인 확인 칸(비번 또는 계정 이메일) → "탈퇴" → 확인 창
async function openWithdrawConfirm(page, secret) {
    const s = withdrawSection(page);
    await s.locator('input[name="withdrawPassword"], input[name="withdrawConfirmEmail"]').fill(secret);
    await s.getByRole('button', { name: '탈퇴', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '정말 탈퇴할까요?' });
    await expect(dialog).toBeVisible();
    return dialog;
}
// 탈퇴 요청의 서버 응답 상태 받을 준비 → { status: Promise<number> } (준비 뒤에 "탈퇴하기"를 누름)
// 서버가 응답 전에 소켓으로 "탈퇴 완료" 끊기를 먼저 보냄 → 화면이 로그인 화면으로 가며 이 요청을 버려 브라우저 응답으로는 못 받음
// 그래서 요청을 가로채 시험 쪽에서 서버에 그대로 보내고 서버가 준 상태를 씀, 화면엔 같은 응답을 돌려줌(이미 떠났으면 버림)
async function watchWithdrawStatus(page, { timeoutMs = 15_000 } = {}) {
    const pattern = '**/user/me/withdraw';
    let handler = null;
    let timer = null;
    const status = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`탈퇴 요청이 안 감 (${timeoutMs}ms)`)), timeoutMs);
        // 가로채기 풀기는 이 요청을 다 처리한 뒤에 (처리 중에 풀면 브라우저 요청이 그대로 서버로 가서 탈퇴 요청이 두 번 감)
        handler = async (route) => {
            if (route.request().method() !== 'POST') return route.fallback();
            try {
                const res = await route.fetch();
                resolve(res.status());
                await route.fulfill({ response: res }).catch(() => {});
            } catch (error) {
                reject(error);
                await route.abort().catch(() => {});
            } finally {
                await page.unroute(pattern, handler).catch(() => {});
            }
        };
    }).finally(() => clearTimeout(timer));
    status.catch(() => {}); // 기다리는 쪽이 받기 전에 실패해도 처리 안 된 실패로 안 뜨게
    await page.route(pattern, handler);
    return { status };
}
// 확인 창에서 "탈퇴하기" → 서버 응답 상태 번호
async function withdrawUi(page, secret) {
    const dialog = await openWithdrawConfirm(page, secret);
    const { status } = await watchWithdrawStatus(page);
    await dialog.getByRole('button', { name: '탈퇴하기' }).click();
    return status;
}

// 닉네임 바꾸기 → 응답 상태 번호
async function changeNicknameUi(page, nickname) {
    const s = nicknameSection(page);
    await s.getByPlaceholder('새 닉네임', { exact: true }).fill(nickname);
    const res = page.waitForResponse((r) => r.url().includes('/user/me/nickname') && r.request().method() === 'PATCH');
    await s.getByRole('button', { name: '변경', exact: true }).click();
    return (await res).status();
}

// ── 로비·마이페이지 ──
const banner = (page) => page.getByRole('button', { name: '마이페이지' });
// 로비 톱니 그림 (화면 주소 규칙 publicAsset: NFC로 맞춰 인코딩)
const GEAR_SRC = encodeURI('/button/설정톱니바퀴.webp'.normalize('NFC'));
const gearImage = (page) => page.locator(`img[src="${GEAR_SRC}"]`);

// 로비 → 배너 → 마이페이지 (단추 넷이 보일 때까지)
async function gotoMyPage(page) {
    await ui.gotoLobby(page);
    await banner(page).click();
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(page.getByRole('button', { name: '계정 관리', exact: true })).toBeVisible();
}

// 전적 줄 값 칸 (이름 칸 바로 옆) — 예: statValue(page, '전체 판수') → '0'
const statValue = (page, label) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');

// 그림 주소 → 파일 이름만 (인코딩·NFC/NFD 차이 없앰) — 예: '/shopItem/player-profile/%ED%94%84...' → '프로필-기사.webp'
const fileNameOf = (src) => decodeURI(String(src ?? '')).normalize('NFC').split('/').pop();

// ── 판 ──
// 사람 1 + 봇으로 total명 판 시작, 나 시민·봇 첫째 광대로 고정 → 판
async function startCitizenGame(table, user, total) {
    const me = user.account.uuid;
    let joker = null;
    const t = await table.setup({
        humans: [user],
        bots: total - 1,
        settings: customRoleSettings({ JOKER: 1 }),
        roles: ({ bots }) => {
            joker = bots[0].account.uuid;
            return { [me]: 'CITIZEN', [joker]: 'JOKER' };
        },
    });
    const s = await t.state();
    expect(s.players).toHaveLength(total);
    expect(s.players.find((p) => p.uuid === me)?.role, '정한 직업이 안 맞음').toBe('CITIZEN');
    expect(s.players.find((p) => p.uuid === joker)?.role, '정한 직업이 안 맞음').toBe('JOKER');
    t.jokerUuid = joker;
    return t;
}

// 판 중 그 사람 쿠키로 탈퇴 요청 (화면 단추는 판 화면에 없음)
const withdrawApi = (context, body) => apiCall(context, 'POST', '/user/me/withdraw', body);

// 판 중 탈퇴가 409로 막히고 판·내 자리가 그대로인지
async function expectWithdrawBlockedInGame(t, user) {
    const r = await withdrawApi(user.context, { password: user.account.password });
    expect(r.status).toBe(409);
    expect(r.body?.code).toBe('WITHDRAW_IN_GAME');
    await expect(user.page).toHaveURL(/\/ingame/);
    const s = await t.state();
    expect(s?.phase).not.toBe('ENDED');
    expect(s.players.find((p) => p.uuid === user.account.uuid)?.alive).toBe(true);
    // 계정도 그대로 (내 계정 정보가 읽힘)
    expect((await apiCall(user.context, 'GET', '/user/me/account')).status).toBe(200);
}

// 봇 표로 광대 처형 → 시민 승 → 결과 화면까지 (나는 아무것도 안 냄 = 기권)
async function playCitizenWin(t, user) {
    const joker = t.jokerUuid;
    await t.assertBotsCanExecute(joker);
    t.playBots((bot) => ({ dayVote: bot.account.uuid === joker ? 'abstain' : joker, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([user.page]);
    await finishGame(t, { stepDelayMs: 1200 });
    await waitResult(user.page);
}

module.exports = {
    TEXT, WITHDRAW_NOTICE_LINES, MYPAGE_BUTTONS,
    testPassword, SHORT_PASSWORD, WRONG_PASSWORD, freshEmail, freshNickname,
    apiCall, isPost, countRequests, blockSocket,
    resetLinkFor, tokenOf, mailsOf, expectNoMail, expireResetTokens, makeSocialOnly,
    loginFailAlert, freshBrowser, shareSession,
    newPasswordBox, newPasswordConfirmBox, requestResetUi, requestResetApi, requestSentNotice, openResetLink, submitNewPassword, resetPasswordVia,
    eyeButtonOf, expectIconReadable, expectLabelReadable, expectNotClipped,
    findNicknameBox, findBirthBox, findIdUi, submitFindId, foundEmailText, findFailText,
    gotoAccount, section, pwSection, emailSection, withdrawSection, nicknameSection, currentPwBox,
    fillPasswordChange, changePasswordUi, failCurrentPassword,
    sendEmailCode, resendEmailCode, confirmEmailCode, changeEmailUi,
    openWithdrawConfirm, watchWithdrawStatus, withdrawUi, changeNicknameUi,
    banner, gearImage, gotoMyPage, statValue, fileNameOf,
    startCitizenGame, withdrawApi, expectWithdrawBlockedInGame, playCitizenWin,
};
