// 판 중 나가기: 확인 창(취소·확인), 산 채로 나가면 판에서 빠져 죽음 처리·결과 패, 죽은 뒤 사망 후 선택(관전 계속하기·게임 나가기)
// 나가기는 window.confirm "게임에서 나가시겠습니까?" → 확인이면 멀티 화면
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');
const db = require('../../../helpers/db');

const CONFIRM = '게임에서 나가시겠습니까?';

async function solo({ user, table, role = 'CITIZEN', bots = 3, phase = 'DAY' }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => (role === 'JOKER' ? { [user.account.uuid]: 'JOKER' } : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.dismissOverlays(user.page);
    return t;
}

// 누르면 뜨는 확인 창(window.confirm) 받기: 누르기 전에 손잡이를 걸어야 누르기가 안 멈춤 → 확인 창 글
async function clickWithConfirm(page, locator, accept) {
    let message = null;
    page.once('dialog', (d) => { message = d.message(); (accept ? d.accept() : d.dismiss()).catch(() => {}); });
    await locator.click();
    await expect.poll(() => message, { timeout: 10000 }).not.toBeNull();
    return message;
}
const clickExit = (page, accept) => clickWithConfirm(page, page.getByRole('button', { name: '게임 나가기' }).first(), accept);

test.describe('살아 있을 때 나가기', () => {
    test('게임 나가기를 누르면 → "게임에서 나가시겠습니까?" 확인 창이 뜸 @game', async ({ user, table }) => {
        await solo({ user, table });
        expect(await clickExit(user.page, false)).toBe(CONFIRM);
    });

    test('확인 창에서 취소하면 → 인게임 화면에 그대로 있고 판에도 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await clickExit(user.page, false);
        await c.sleep(1000);
        await expect(user.page).toHaveURL(/\/ingame/);
        expect((await t.player(user.account.uuid)).isParticipating).toBe(true);
    });

    test('확인 창에서 확인하면 → 멀티 화면으로 감 @game', async ({ user, table }) => {
        await solo({ user, table });
        await clickExit(user.page, true);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
    });

    test('산 채로 나가면 → 서버 판에서 참가 중 아님·죽음으로 바뀜 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await clickExit(user.page, true);
        await expect.poll(async () => { const me = await t.player(user.account.uuid); return `${me?.isParticipating}/${me?.alive}`; }, { timeout: 15000 }).toBe('false/false');
    });

    test('나간 뒤 /ingame을 다시 열면 → 판으로 못 돌아가고 멀티 화면으로 보내짐 @game', async ({ user, table }) => {
        await solo({ user, table, bots: 4 });
        await clickExit(user.page, true);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
        await user.page.goto('/ingame');
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 20000 });
    });

    test('내가 나가면 → p2 화면의 내 카드가 사망 상태로 바뀜 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.dismissOverlays(user.page);
        await clickExit(user.page, true);
        await c.dismissOverlays(p2.page);
        await expect(p2.page.locator(`[data-ingame-player-nickname="${user.account.nickname}"]`)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15000 });
    });

    test('내가 나간 뒤 봇이 말해도 → 나간 나는 그 채팅 사건을 안 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        const frames = c.watchSocket(user.page);
        await clickExit(user.page, true);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
        const text = c.uniq('나간뒤');
        await c.botSay(t, 1, text);
        await c.sleep(1500);
        expect(frames.some((f) => f.payload?.text === text)).toBe(false);
    });

    test('하나뿐인 광대(나)가 산 채로 나가면 → 광대가 없어 시민 승으로 판이 끝남 @game', async ({ user, table }) => {
        const t = await solo({ user, table, role: 'JOKER', bots: 3 });
        await clickExit(user.page, true);
        await expect.poll(async () => (await t.state())?.winResult?.winner ?? (await t.state())?.phase ?? 'GONE', { timeout: 20000 }).toMatch(/CITIZEN|ENDED|GONE/);
    });

    test('시민인 내가 나가서 광대 1 : 시민 1이 되면 → 광대 승으로 판이 끝남 @game', async ({ user, table }) => {
        // 4인(광대1·시민3)에서 봇 시민 하나 처형 뒤 내가 나가면 1:1
        const t = await solo({ user, table, bots: 3 });
        await c.executeByBots(t, t.bots[1].account.uuid);
        await t.stopBots();
        await c.readyToChat(user.page);
        await clickExit(user.page, true);
        await expect.poll(async () => { const s = await t.state(); return s ? (s.winResult?.winner ?? s.phase) : 'GONE'; }, { timeout: 20000 }).toMatch(/JOKER|ENDED|GONE/);
    });

    test('산 채로 나간 뒤 판이 끝나면 → 내 판 결과가 패배로 저장됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 3 });
        const gameId = t.gameId;
        await clickExit(user.page, true);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
        // 남은 봇 판 끝까지: 광대가 시민을 밤마다 죽임
        await c.replan(t, (bot, i) => ({ dayVote: 'abstain', tribunal: 'skip', night: i === 0 ? 'random' : 'skip', pollMs: 200 }));
        await t.advanceUntil((s) => s.phase === 'ENDED', { stepDelayMs: 900, maxSteps: 40 }).catch(() => {});
        await expect.poll(async () => {
            const rows = await db.query('SELECT won FROM game_result_players WHERE game_id = ? AND user_id = ?', [gameId, user.account.uuid]);
            return rows.length ? String(rows[0].won) : 'none';
        }, { timeout: 20000 }).toMatch(/^(0|false)$/);
    });
});

test.describe('사망 후 선택 창', () => {
    test('처형되면 → "당신은 사망했습니다." 사망 후 선택 창이 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await expect(dialog).toContainText('당신은 사망했습니다.');
        await expect(dialog.getByRole('button', { name: '관전 계속하기' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: '게임 나가기' })).toBeVisible();
    });

    test('사망 후 선택 창이 떠 있으면 → Esc를 눌러도 안 닫힘 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await user.page.keyboard.press('Escape');
        await c.sleep(500);
        await expect(dialog).toBeVisible();
    });

    test('관전 계속하기를 누르면 → 창이 닫히고 인게임 화면에서 죽은 사람 채팅을 씀 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 20000 });
        await expect(dialog).toBeHidden();
        await expect(user.page).toHaveURL(/\/ingame/);
        const text = c.uniq('관전중');
        await c.say(user.page, text);
        expect(await c.lineChannel(user.page, text)).toBe('DEAD');
    });

    test('관전 계속하기를 고른 뒤 다음 낮이 되어도 → 사망 후 선택 창이 다시 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await t.stopBots();
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2, { stepDelayMs: 500 });
        await c.dismissOverlays(user.page, { keepWatching: false });
        await c.sleep(1000);
        await expect(user.page.getByRole('dialog', { name: '사망 후 선택' })).toHaveCount(0);
    });

    test('사망 후 선택에서 게임 나가기 → 확인하면 멀티 화면으로 감 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        expect(await clickWithConfirm(user.page, dialog.getByRole('button', { name: '게임 나가기' }), true)).toBe(CONFIRM);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
    });

    test('사망 후 선택에서 게임 나가기 → 확인 창 취소하면 선택 창이 그대로 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await clickWithConfirm(user.page, dialog.getByRole('button', { name: '게임 나가기' }), false);
        await c.sleep(500);
        await expect(dialog).toBeVisible();
        await expect(user.page).toHaveURL(/\/ingame/);
    });

    test('죽은 뒤 나가도 → 남은 사람들 판은 계속 진행됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await c.dismissOverlays(user.page, { keepWatching: false });
        const dialog = user.page.getByRole('dialog', { name: '사망 후 선택' });
        await expect(dialog).toBeVisible({ timeout: 20000 });
        await clickWithConfirm(user.page, dialog.getByRole('button', { name: '게임 나가기' }), true);
        await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
        const s = await t.advanceUntil((g) => g.phase === 'DAY' && g.dayIndex === 2, { stepDelayMs: 500 });
        expect(s.phase).toBe('DAY');
    });

    test('브라우저 뒤로 가기를 누르면 → 인게임 화면에서 안 벗어남 @game', async ({ user, table }) => {
        await solo({ user, table });
        await user.page.goBack().catch(() => {});
        await c.sleep(1000);
        await expect(user.page).toHaveURL(/\/ingame/);
    });
});

test('재판 연출이 떠 있는 동안 → 게임 나가기 버튼이 잠겨(inert) 눌리지 않음 @game', async ({ user, table }) => {
    const t = await solo({ user, table, bots: 4 });
    await c.replan(t, { dayVote: user.account.uuid, tribunal: 'skip', night: 'skip', pollMs: 200 });
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
    await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
    const locked = await user.page.locator('[aria-label="게임 나가기"]').first().evaluate((el) => Boolean(el.closest('[inert]')));
    expect(locked).toBe(true);
});

test('광대 둘 중 광대인 내가 밤에 나가면 → 판은 남은 광대로 계속됨 @game', async ({ user, table }) => {
    const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, 'NIGHT');
    await c.dismissOverlays(user.page);
    await clickExit(user.page, true);
    await expect(user.page).toHaveURL(/\/multiplay/, { timeout: 15000 });
    const s = await t.state();
    expect(s.phase).not.toBe('ENDED');
    expect(s.players.filter((p) => p.role === 'JOKER' && p.alive).length).toBe(1);
});
