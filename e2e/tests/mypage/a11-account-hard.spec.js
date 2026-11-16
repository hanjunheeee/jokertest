'use strict';

// 계정 관리 어려움 브라우저 시험: PC 비번 바꾸면 폰이 끊김(진짜 5초)·탈퇴 안내가 폰에 먼저·판 끝난 뒤 탈퇴·이메일 바꾼 뒤 다른 브라우저 재설정·다시 받기 1분 진짜로·친구 목록에서 빠짐·같은 이메일 새 계정
// 목록 A11b 브라우저 어려움 A11-H-503~506·508~510 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-account-hard.spec.js)
const { test, expect, ui, mail } = require('../../helpers/fixtures');
const { sleep } = require('../../helpers/wait');
const { api, makeFriends } = require('../../helpers/friends');
const { prepareValidSignup, submitSignup } = require('../auth/authHelpers');
const k = require('../auth/_a11b-kit');

// 세션 검사 주기 5초 + 허용 폭 1.5초 (시험_계획 3-5)
const SESSION_CHECK_MS = 5_000;
const SLACK_MS = 1_500;

// 한 사람이 PC·폰 둘: PC는 소켓을 막고(한 계정 소켓 하나라 PC가 붙으면 폰이 밀려남) 폰은 로비에 붙어 있음
async function pcAndPhone(players, accounts) {
    const account = await accounts.create();
    const pc = await players.add({ mobile: false, account, lobby: false });
    await k.blockSocket(pc.context);
    const phone = await players.add({ mobile: true, account });
    await expect(phone.page).toHaveURL(/\/lobby$/);
    return { account, pc, phone };
}

test('A11-H-503 PC에서 비번 바꿈 → 폰 로비가 5초 안팎에 로그인 화면 @hard @realtime', async ({ players, accounts }) => {
    const { account, pc, phone } = await pcAndPhone(players, accounts);
    await k.gotoAccount(pc.page);
    // 바꾸기 직전까지 폰은 로비 그대로
    await expect(phone.page).toHaveURL(/\/lobby$/);
    expect(await k.changePasswordUi(pc.page, { current: account.password, next: k.testPassword() })).toBe(200);
    const changedAt = Date.now();
    await expect(phone.page).toHaveURL(/\/login/, { timeout: SESSION_CHECK_MS + SLACK_MS + 3_000 });
    expect(Date.now() - changedAt).toBeLessThanOrEqual(SESSION_CHECK_MS + SLACK_MS);
});

test('A11-H-504 PC에서 탈퇴 → 폰 화면 첫 안내가 탈퇴 안내(세션 만료 아님) 뒤 로그인 화면 @hard', async ({ players, accounts }) => {
    const { account, pc, phone } = await pcAndPhone(players, accounts);
    await k.gotoAccount(pc.page);
    expect(await k.withdrawUi(pc.page, account.password)).toBe(200);
    // 폰: 브라우저 알림이 양피지 안내 창으로 뜸 (로그인 화면으로 넘어가도 못 닫은 안내는 다시 뜸)
    const notice = phone.page.getByRole('alertdialog', { name: '안내' });
    await expect(notice).toBeVisible({ timeout: 10_000 });
    const first = await notice.getByRole('paragraph').first().innerText();
    expect(first).toMatch(/탈퇴/);
    expect(first).not.toMatch(/로그인 유지 시간|세션/);
    await expect(phone.page).toHaveURL(/\/login/, { timeout: 10_000 });
});

test('A11-H-505 판 끝나면 탈퇴 됨 (6명 판, 사람 1 + 봇 5): 판 중 409 → 판 끝까지 → 결과 화면 나가 로비 → 계정 관리 탈퇴 → 로그인 화면 @hard @game @smoke', async ({ user, table }) => {
    test.setTimeout(300_000);
    const t = await k.startCitizenGame(table, user, 6);
    await k.expectWithdrawBlockedInGame(t, user);
    await k.playCitizenWin(t, user);
    await user.page.getByRole('button', { name: '로비로' }).click();
    await expect(user.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await k.banner(user.page).click();
    await user.page.getByRole('button', { name: '계정 관리', exact: true }).click();
    await expect(user.page.getByText(/지금 이메일: .+@/)).toBeVisible();
    expect(await k.withdrawUi(user.page, user.account.password)).toBe(200);
    await expect(user.page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-H-506 이메일 바꿈 → 로그인 안 한 다른 브라우저에서 새 주소로 비번 찾기 → 링크 → 새 비번 → 새 주소로 로그인 @hard', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = await k.changeEmailUi(page, { password: account.password });
    const other = await k.freshBrowser(players, account);
    const since = Date.now() - 1000;
    expect(await k.requestResetUi(other.page, next)).toBe(200);
    await k.openResetLink(other.page, await k.resetLinkFor(next, { since }));
    const password = k.testPassword();
    await k.submitNewPassword(other.page, password);
    await expect(other.page.getByText(k.TEXT.resetDone, { exact: true })).toBeVisible();
    await other.page.getByRole('button', { name: '로그인으로 이동' }).click();
    await ui.loginViaUi(other.page, { email: next, password });
    await expect(other.page).toHaveURL(/\/lobby$/);
});

test('A11-H-508 인증번호 다시 받기 1분을 진짜로: 59초에 다시 → "(n초 뒤)", 61초에 다시 → 번호 받음 @hard @realtime', async ({ user }) => {
    test.setTimeout(180_000);
    const { page, account } = user;
    await k.gotoAccount(page);
    const to = k.freshEmail('ec');
    expect(await k.sendEmailCode(page, { newEmail: to, password: account.password })).toBe(200);
    // 서버가 보낸 시각은 이 응답보다 앞 → 이 시각 기준 59초면 서버로도 60초 안
    const sentAt = Date.now();
    await mail.waitForCode(to, 'EMAIL_CHANGE_CODE', { since: sentAt - 5_000 });
    await sleep(sentAt + 59_000 - Date.now());
    expect(await k.resendEmailCode(page)).toBe(429);
    await expect(k.emailSection(page).getByText(/\(\d+초 뒤\)$/)).toBeVisible();
    await sleep(sentAt + 61_000 - Date.now());
    const since = Date.now();
    expect(await k.resendEmailCode(page)).toBe(200);
    await expect(k.emailSection(page).getByText(/^인증번호를 보냈습니다/)).toBeVisible();
    expect(await mail.waitForCode(to, 'EMAIL_CHANGE_CODE', { since: since - 1_000 })).toMatch(/^\d+$/);
});

test('A11-H-509 탈퇴하면 친구 목록에서 빠짐 (사람 2): A·B 친구 → B 탈퇴 → A 친구 목록 새로고침 → B 없음 @hard', async ({ user, players }) => {
    const a = user;
    const b = await players.add();
    await makeFriends(a, b);
    // 준비 확인: A 친구 목록에 B
    await a.page.getByRole('button', { name: '친구 목록' }).click();
    await expect(a.page.getByRole('listitem').filter({ hasText: b.account.nickname })).toBeVisible();
    // B 탈퇴
    await k.gotoAccount(b.page);
    expect(await k.withdrawUi(b.page, b.account.password)).toBe(200);
    await expect(b.page).toHaveURL(/\/login$/, { timeout: 10_000 });
    // A 새로고침 → 친구 목록에 B 없음
    await a.page.reload();
    await ui.skipIntro(a.page);
    await a.page.getByRole('button', { name: '친구 목록' }).click();
    await expect(a.page.getByRole('dialog', { name: /친구/ })).toBeVisible();
    await expect(a.page.getByRole('listitem').filter({ hasText: b.account.nickname })).toHaveCount(0);
    const friends = await api(a, 'GET', '/friends');
    expect(friends.map((f) => f.id ?? f.uuid)).not.toContain(b.account.uuid);
});

test('A11-H-510 판 1번 한 계정 (8명 판, 사람 1 + 봇 7) 탈퇴 → 같은 이메일로 다시 가입 → 마이페이지 전체 판수 0·친구 없음 @hard @game', async ({ user, table, players }) => {
    test.setTimeout(300_000);
    // 옛 계정: 친구 하나 + 판 하나
    const friend = await players.add();
    await makeFriends(user, friend);
    const t = await k.startCitizenGame(table, user, 8);
    await k.playCitizenWin(t, user);
    await user.page.getByRole('button', { name: '로비로' }).click();
    await expect(user.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await k.gotoAccount(user.page);
    expect(await k.withdrawUi(user.page, user.account.password)).toBe(200);
    await expect(user.page).toHaveURL(/\/login$/, { timeout: 10_000 });
    // 같은 이메일로 다시 가입 → 로그인
    const values = await prepareValidSignup(user.page, { email: user.account.email, password: k.testPassword() });
    expect(await submitSignup(user.page)).toMatch(/회원가입이 완료되었습니다/);
    await ui.loginViaUi(user.page, { email: user.account.email, password: values.password });
    // 새 계정: 전체 판수 0, 친구 0
    await k.gotoMyPage(user.page);
    await expect(k.statValue(user.page, '전체 판수')).toHaveText('0');
    const friends = await api({ context: user.context }, 'GET', '/friends');
    expect(friends).toHaveLength(0);
});
