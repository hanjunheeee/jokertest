'use strict';

// 비번 재설정 어려움 브라우저 시험: 폰에서 재설정하면 로비의 PC가 스스로 끊김(진짜 5초 검사)·같은 링크 두 탭 동시 저장·아이디 찾기→재설정→로그인
// 목록 A11b 브라우저 어려움 A11-H-501·502·507 (쓰는 동안 안 돌림: npx playwright test --list tests/auth/a11-reset-hard.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const k = require('./_a11b-kit');

// 세션 검사 주기 5초 + 허용 폭 1.5초 (시험_계획 3-5)
const SESSION_CHECK_MS = 5_000;
const SLACK_MS = 1_500;

test('A11-H-501 PC 로비에 있는 채 폰에서 비번 찾기 → 새 비번 → PC가 손잡이 없이 기다려 로그인 화면 @hard @realtime', async ({ user, players }) => {
    // PC: 로그인해 로비 (소켓 붙음) / 폰: 같은 계정, 로그인 안 함
    const phone = await players.add({ mobile: true, account: user.account, login: false });
    expect(await k.requestResetUi(phone.page, user.account.email)).toBe(200);
    await expect(k.requestSentNotice(phone.page, true)).toBeVisible();
    const url = await k.resetLinkFor(user.account.email, { mobile: true });
    await k.openResetLink(phone.page, url);
    await k.submitNewPassword(phone.page, k.testPassword());
    await expect(phone.page.getByText(k.TEXT.resetDone, { exact: true })).toBeVisible();
    const doneAt = Date.now();
    // PC는 아무것도 안 누름 → 서버 세션 검사(5초 주기)가 끊어 로그인 화면으로
    await expect(user.page).toHaveURL(/\/login/, { timeout: SESSION_CHECK_MS + SLACK_MS + 3_000 });
    expect(Date.now() - doneAt).toBeLessThanOrEqual(SESSION_CHECK_MS + SLACK_MS);
});

test('A11-H-502 같은 링크를 탭 둘에서 동시에 저장 → 한 탭은 완료, 한 탭은 "이미 사용된 링크예요…" @hard @smoke', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    const url = await k.resetLinkFor(acc.email);
    const second = await page.context().newPage();
    await k.openResetLink(page, url);
    await k.openResetLink(second, url);
    const a = k.testPassword();
    const b = k.testPassword();
    for (const [tab, pw] of [[page, a], [second, b]]) {
        await k.newPasswordBox(tab).fill(pw);
        await k.newPasswordConfirmBox(tab).fill(pw);
    }
    // 두 탭 단추를 같이 누름
    await Promise.all([
        page.getByRole('button', { name: '비밀번호 변경' }).click(),
        second.getByRole('button', { name: '비밀번호 변경' }).click(),
    ]);
    // 탭마다 무엇이 떴나 → 완료 하나·사용됨 하나
    const outcome = async (tab) => {
        if (await tab.getByText(k.TEXT.resetDone, { exact: true }).isVisible()) return 'done';
        if (await tab.getByText(k.TEXT.linkUsed, { exact: true }).isVisible()) return 'used';
        return 'none';
    };
    await expect.poll(async () => [await outcome(page), await outcome(second)].sort().join(','), { timeout: 15_000 }).toBe('done,used');
});

test('A11-H-507 아이디 찾기로 가린 이메일 → 비번 찾기 → 링크 → 새 비번 → 로그인 → 마이페이지 전적·닉네임 그대로 @hard', async ({ page, accounts }) => {
    const acc = await accounts.create();
    // 바꾸기 전 전적 (서버 값) — API로만 잠깐 로그인했다가 쿠키 지움 (화면은 아직 안 엶)
    await ui.loginViaApi(page.context(), acc);
    const before = (await k.apiCall(page.context(), 'GET', '/user/me/profile')).body?.data;
    await page.context().clearCookies();
    expect(before?.nickname).toBe(acc.nickname);

    // 아이디 찾기 → 가린 이메일
    expect(await k.findIdUi(page, { nickname: acc.nickname })).toBe(200);
    const masked = (await k.foundEmailText(page).innerText()).trim();
    expect(masked).toMatch(/\*/);
    // 비번 찾기 → 링크 → 새 비번
    const since = Date.now() - 1000;
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    await k.openResetLink(page, await k.resetLinkFor(acc.email, { since }));
    const next = k.testPassword();
    await k.submitNewPassword(page, next);
    await expect(page.getByText(k.TEXT.resetDone, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '로그인으로 이동' }).click();
    await ui.loginViaUi(page, { email: acc.email, password: next });
    // 마이페이지: 닉네임·전체 판수·승률이 전과 같음
    await k.gotoMyPage(page);
    await expect(k.statValue(page, '전체 판수')).toHaveText(Number(before.total_games).toLocaleString());
    await expect(k.statValue(page, '승률')).toHaveText(`${(Number(before.account_win_rate) * 100).toFixed(1)}%`);
    await expect(page.getByText(acc.nickname, { exact: true }).first()).toBeVisible();
});
