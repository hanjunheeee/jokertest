// 같은 계정 두 곳: 같은 브라우저 다른 탭(REPLACED_BY_SAME_SESSION 안내만) · 다른 곳 로그인(REPLACED_BY_OTHER_LOGIN → 로그인 화면)
// 판 중인 탭이 밀릴 때 화면·서버 판 상태 확인, 소켓 글은 c.watchSocket으로 엿봄
const { test, expect, ui } = require('../../../helpers/fixtures');
const c = require('./_lib');

const SAME_TAB_MESSAGE = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';

// 시험 시작 전 소켓 엿보기 붙이고 새로고침 → 판 차리고 낮까지
async function setup({ user, table, players, withP2 = false }) {
    const frames = c.watchSocket(user.page);
    const alerts = [];
    user.page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await user.page.reload();
    await ui.skipIntro(user.page);
    const p2 = withP2 ? await players.add() : null;
    const humans = p2 ? [user, p2] : [user];
    const t = await c.startGame(table, { humans, bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', ...(p2 ? { [p2.account.uuid]: 'CITIZEN' } : {}) }) });
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(user.page);
    return { t, p2, frames, alerts };
}

// 같은 context(같은 쿠키)에 새 탭 → 로비 열기
async function openSecondTab(context, path = '/lobby') {
    const tab = await context.newPage();
    tab.on('dialog', (d) => d.accept().catch(() => {}));
    await tab.goto(path);
    return tab;
}

test.describe('같은 브라우저 다른 탭', () => {
    test('판 중에 같은 브라우저 새 탭에서 로비를 열면 → 원래 탭에 "다른 창에서 접속" 알림이 뜸 @game', async ({ user, table, players, context }) => {
        const { alerts } = await setup({ user, table, players });
        await openSecondTab(context);
        await expect.poll(() => alerts.includes(SAME_TAB_MESSAGE), { timeout: 15000 }).toBe(true);
    });

    test('새 탭에 밀리면 → 원래 탭 소켓이 REPLACED_BY_SAME_SESSION 끊김 코드를 받음 @game', async ({ user, table, players, context }) => {
        const { frames } = await setup({ user, table, players });
        await openSecondTab(context);
        await expect.poll(() => frames.find((f) => f.event === 'force_disconnect')?.payload?.code, { timeout: 15000 }).toBe('REPLACED_BY_SAME_SESSION');
    });

    test('새 탭에 밀려도 → 원래 탭은 로그아웃되지 않고 인게임 주소에 그대로 있음 @game', async ({ user, table, players, context }) => {
        const { alerts } = await setup({ user, table, players });
        await openSecondTab(context);
        await expect.poll(() => alerts.length, { timeout: 15000 }).toBeGreaterThan(0);
        await c.sleep(1500);
        await expect(user.page).toHaveURL(/\/ingame/);
    });

    test('새 탭에서 /ingame을 열면 → 그 탭에서 판이 이어지고 채팅이 됨 @game', async ({ user, table, players, context }) => {
        const { t } = await setup({ user, table, players });
        const tab = await openSecondTab(context, '/ingame');
        const text = c.uniq('새탭');
        await c.say(tab, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('새 탭에 밀린 원래 탭에서 채팅해도 → 다른 사람에게 안 감 @game', async ({ user, table, players, context }) => {
        const { t, p2, alerts } = await setup({ user, table, players, withP2: true });
        await openSecondTab(context, '/ingame');
        await expect.poll(() => alerts.length, { timeout: 15000 }).toBeGreaterThan(0);
        const text = c.uniq('옛탭');
        await c.chatBox(user.page).fill(text);
        await c.chatBox(user.page).press('Enter');
        await c.readyToChat(p2.page);
        await c.expectNoText(p2.page, text, { waitMs: 2500 });
        expect(c.botGot(t, 1, 'day_chat_message_received', text)).toBe(false);
    });

    test('새 탭으로 옮겨도 → 서버 판에서 나는 계속 참가 중 @game', async ({ user, table, players, context }) => {
        const { t } = await setup({ user, table, players });
        const tab = await openSecondTab(context, '/ingame');
        await c.readyToChat(tab);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await c.sleep(1000);
        expect((await t.player(user.account.uuid)).isParticipating).toBe(true);
    });
});

test.describe('다른 곳에서 로그인', () => {
    test('판 중에 다른 브라우저에서 같은 계정으로 로그인하면 → 원래 탭이 로그인 화면으로 감 @game', async ({ user, table, players }) => {
        await setup({ user, table, players });
        const other = await players.add({ account: user.account });
        await expect(other.page).toHaveURL(/\/lobby/);
        await expect(user.page).toHaveURL(/\/login/, { timeout: 20000 });
    });

    test('다른 브라우저 로그인으로 밀리면 → 원래 탭에 다른 로그인·세션 끝 알림이 뜸 @game', async ({ user, table, players }) => {
        const { alerts } = await setup({ user, table, players });
        await players.add({ account: user.account });
        await expect.poll(() => alerts.join('|'), { timeout: 20000 }).toMatch(/다른 기기 또는 브라우저에서 로그인|세션이 만료|다시 로그인/);
    });

    test('다른 브라우저 소켓이 붙으면 → 원래 탭 소켓이 REPLACED_BY_OTHER_LOGIN 또는 세션 끝 코드를 받음 @game', async ({ user, table, players }) => {
        const { frames } = await setup({ user, table, players });
        await players.add({ account: user.account });
        await expect.poll(() => frames.find((f) => f.event === 'force_disconnect')?.payload?.code ?? null, { timeout: 20000 })
            .toMatch(/REPLACED_BY_OTHER_LOGIN|SESSION_EXPIRED/);
    });

    test('다른 브라우저에서 로그인한 쪽이 /ingame을 열면 → 그쪽에서 판이 이어짐 @game', async ({ user, table, players }) => {
        const { t } = await setup({ user, table, players });
        const other = await players.add({ account: user.account });
        await other.page.goto('/ingame');
        const text = c.uniq('다른기기');
        await c.say(other.page, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('다른 곳 로그인 뒤 → 원래 브라우저 쿠키로는 내 정보 API가 401 @game', async ({ user, table, players, context }) => {
        await setup({ user, table, players });
        await players.add({ account: user.account });
        const { E2E } = require('../../../helpers/env');
        await expect.poll(async () => (await context.request.get(`${E2E.apiUrl}/auth/me`, { headers: { origin: E2E.desktopUrl } })).status(), { timeout: 15000 }).toBe(401);
    });

    test('다른 곳 로그인으로 원래 탭이 밀려도 → 서버 판의 내 자리·생존은 그대로 @game', async ({ user, table, players }) => {
        const { t } = await setup({ user, table, players });
        const other = await players.add({ account: user.account });
        await other.page.goto('/ingame');
        await c.readyToChat(other.page);
        const me = await t.player(user.account.uuid);
        expect(me.alive).toBe(true);
        expect(me.isParticipating).toBe(true);
    });
});

test('새 탭에 밀린 원래 탭을 새로고침하면 → 원래 탭이 다시 판을 잡고 새 탭이 밀림 알림을 받음 @game', async ({ user, table, players, context }) => {
    const { t } = await setup({ user, table, players });
    const tab = await context.newPage();
    const tabAlerts = [];
    tab.on('dialog', (d) => { tabAlerts.push(d.message()); d.accept().catch(() => {}); });
    await tab.goto('/ingame');
    await c.readyToChat(tab);
    await user.page.reload();
    await expect.poll(() => tabAlerts.includes(SAME_TAB_MESSAGE), { timeout: 15000 }).toBe(true);
    const text = c.uniq('다시주인');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
});

test('같은 브라우저 새 탭이 판 밖(로비)이어도 → 서버 판에서 나는 안 빠짐 @game', async ({ user, table, players, context }) => {
    const { t, alerts } = await setup({ user, table, players });
    await openSecondTab(context, '/lobby');
    await expect.poll(() => alerts.length, { timeout: 15000 }).toBeGreaterThan(0);
    await c.sleep(1000);
    expect((await t.player(user.account.uuid)).isParticipating).toBe(true);
});

test('다른 곳 로그인으로 밀린 원래 브라우저에서 /ingame을 다시 열면 → 판에 못 들어가고 로그인 화면 @game', async ({ user, table, players }) => {
    await setup({ user, table, players });
    await players.add({ account: user.account });
    await expect(user.page).toHaveURL(/\/login/, { timeout: 20000 });
    await user.page.goto('/ingame');
    await expect(user.page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
});
