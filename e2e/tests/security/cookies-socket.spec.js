// 본보기(security): 로그인 쿠키 속성(HttpOnly·SameSite), 남의 사이트 Origin 소켓 거절, 채팅 XSS 안 돎
const { test, expect, E2E } = require('../../helpers/fixtures');
const sec = require('../../helpers/security');

test('로그인하면 → 토큰 쿠키가 HttpOnly·SameSite=Lax로 옴', async ({ accounts }) => {
    const account = await accounts.create();
    const res = await sec.readResponse(`${E2E.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
    });
    expect(res.status).toBe(200);
    const cookies = res.setCookies.map(sec.parseSetCookie);
    const access = cookies.find((c) => c.name === 'accessToken');
    expect(access?.httpOnly).toBe(true);
    expect(access?.sameSite?.toLowerCase()).toBe('lax');
});

test('남의 사이트 Origin으로 소켓을 열면 → 연결이 거절됨', async ({ accounts }) => {
    const account = await accounts.create();
    const { cookie } = await sec.loginCookie(account);
    const evil = await sec.openRawSocket({ cookie, origin: 'https://evil.example' });
    expect(evil.connected).toBe(false);
    const good = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
    expect(good.connected).toBe(true);
    good.close();
});

test('낮 채팅에 스크립트를 넣어도 → 실행되지 않고 글자로만 보임 @game', async ({ page, context, accounts, table, ui }) => {
    const trap = await sec.trapXss(page);
    const account = await accounts.create();
    await ui.loginViaApi(context, account);
    await ui.gotoLobby(page);
    const t = await table.setup({ humans: [{ page, account }], bots: 1 });
    await ui.readRoleReveal(page);
    await t.advanceUntil('DAY');
    const [payload] = sec.xssPayloads('chat');
    // 봇이 보낸 글이 내 화면에 그려짐
    await t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text: payload });
    await ui.expectChat(page, 'onerror');
    await page.waitForTimeout(500);
    sec.assertNoXss(trap);
});
