// 연결: 새로고침·탭 닫았다 다시 들어오기·잠깐 끊김(오프라인) 뒤 판 복구, 끊긴 채 단계가 넘어가면 판에서 빠짐
// 판: 사람 하나·둘 + 봇, 서버 판 기준은 e2e.game (isParticipating)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

// 나 시민·봇0 광대, 낮까지
async function solo({ user, table, bots = 3, phase = 'DAY' }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    return t;
}
async function duo({ user, players, table, phase = 'DAY', p2Role = 'CITIZEN' }) {
    const p2 = await players.add();
    const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: p2Role, ...(p2Role === 'JOKER' ? {} : { [b[0].account.uuid]: 'JOKER' }) }) });
    await c.phaseTo(t, phase);
    return { t, p2 };
}
const participating = async (t, uuid) => (await t.player(uuid))?.isParticipating;
const dayLabel = (page, n) => page.getByText(`제 ${n}일`, { exact: true });

test.describe('새로고침', () => {
    test('낮에 새로고침하면 → 인게임 화면 그대로 "제 1일"과 내 카드가 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await user.page.reload();
        await c.dismissOverlays(user.page);
        await expect(user.page).toHaveURL(/\/ingame/);
        await expect(dayLabel(user.page, 1)).toBeVisible();
        await expect(c.selfCard(user.page, user.account.nickname)).toBeVisible();
    });

    test('새로고침한 뒤 → 봇의 새 낮 채팅을 다시 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await user.page.reload();
        await c.readyToChat(user.page);
        const text = c.uniq('새로고침뒤');
        expect((await c.botSay(t, 1, text))?.ok).toBe(true);
        await c.expectLine(user.page, t.bots[1].nickname, text);
    });

    test('새로고침한 뒤 → 내가 보낸 낮 채팅이 p2에게 감 @game', async ({ user, players, table }) => {
        const { p2 } = await duo({ user, players, table });
        await user.page.reload();
        const text = c.uniq('다시왔음');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
    });

    test('새로고침해도 → 서버 판에서 나는 계속 참가 중이고 살아 있음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await user.page.reload();
        await c.readyToChat(user.page);
        const me = await t.player(user.account.uuid);
        expect(me.isParticipating).toBe(true);
        expect(me.alive).toBe(true);
    });

    test('새로고침하고 단계가 넘어가도 → 판에서 안 빠지고 밤 화면이 됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await user.page.reload();
        await c.readyToChat(user.page);
        await c.phaseTo(t, 'NIGHT');
        await c.readyToChat(user.page);
        await expect(user.page.getByText(/\[밤-/)).toBeVisible();
        expect(await participating(t, user.account.uuid)).toBe(true);
    });

    test('새로고침 뒤 "내 역할 보기"를 누르면 → 내 역할 시민이 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await user.page.reload();
        await c.dismissOverlays(user.page);
        await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
        const dialog = user.page.getByRole('dialog', { name: '내 역할 보기' });
        await expect(dialog).toContainText('시민');
    });

    test('밤에 새로고침하면 → 밤 화면으로 돌아오고 같은 직업 채팅을 씀 @game', async ({ user, table }) => {
        const t = await solo({ user, table, phase: 'NIGHT' });
        await user.page.reload();
        const text = c.uniq('밤새로고침');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, 'joker_chat_message', text)).toBe(true);
    });

    test('광대가 밤에 새로고침해도 → 동료 광대 채팅을 계속 받음 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, settings: { jokerCount: 2 }, roles: { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'JOKER' } });
        await c.phaseTo(t, 'NIGHT');
        await user.page.reload();
        await c.readyToChat(user.page);
        const text = c.uniq('광대새로');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('재판 중에 피고인 내가 새로고침하면 → 재판 창이 다시 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.replan(t, { dayVote: user.account.uuid, tribunal: 'skip', night: 'skip', pollMs: 200 });
        await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
        await t.stopBots();
        await user.page.reload();
        await c.dismissOverlays(user.page);
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
        await expect(user.page.getByText('당신은 피고인입니다. 투표할 수 없습니다.')).toBeVisible();
    });

    test('세 번 연달아 새로고침해도 → 판 그대로이고 채팅이 됨 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        for (let i = 0; i < 3; i += 1) {
            await user.page.reload();
            await expect(user.page).toHaveURL(/\/ingame/);
        }
        const text = c.uniq('세번');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
        expect(await participating(t, user.account.uuid)).toBe(true);
    });

    test('죽은 뒤 새로고침해도 → "죽은 사람끼리" 표시와 죽은 사람 채팅이 그대로 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await user.page.reload();
        await c.readyToChat(user.page);
        await expect(c.deadBadge(user.page)).toBeVisible();
        const text = c.uniq('죽은새로');
        await c.say(user.page, text);
        expect(await c.lineChannel(user.page, text)).toBe('DEAD');
    });

    test('p2가 새로고침해도 → 내 화면의 p2 카드는 살아 있음 그대로 @game', async ({ user, players, table }) => {
        const { p2 } = await duo({ user, players, table });
        await p2.page.reload();
        await c.readyToChat(p2.page);
        await c.dismissOverlays(user.page);
        await expect(user.page.locator(`[data-ingame-player-nickname="${p2.account.nickname}"]`)).toHaveAttribute('data-ingame-player-status', 'alive');
    });
});

test.describe('탭 닫았다 다시 들어오기', () => {
    test('탭을 닫고 같은 낮 안에 새 탭으로 /ingame을 열면 → 판으로 돌아옴 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await user.page.close();
        const page = await context.newPage();
        await page.goto('/ingame');
        await c.readyToChat(page);
        await expect(dayLabel(page, 1)).toBeVisible();
        expect(await participating(t, user.account.uuid)).toBe(true);
    });

    test('탭을 닫고 다시 들어오면 → 채팅을 보내고 받을 수 있음 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await user.page.close();
        const page = await context.newPage();
        await page.goto('/ingame');
        const text = c.uniq('돌아옴');
        await c.say(page, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('탭을 닫은 채로 단계가 넘어가면 → 서버가 판에서 나를 뺌 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await user.page.close();
        await c.sleep(1000);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await expect.poll(() => participating(t, user.account.uuid), { timeout: 15000 }).toBe(false);
    });

    test('탭을 닫은 채로 단계가 넘어간 뒤 /ingame을 열면 → 멀티 화면으로 보내짐 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table, bots: 4 });
        await user.page.close();
        await c.sleep(1000);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await expect.poll(() => participating(t, user.account.uuid), { timeout: 15000 }).toBe(false);
        const page = await context.newPage();
        await page.goto('/ingame');
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 20000 });
    });

    test('탭을 닫고 단계가 넘어가 빠지면 → 산 사람에서 빠져 서버 판에 죽음으로 남음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await user.page.close();
        await c.sleep(1000);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await expect.poll(async () => (await t.player(user.account.uuid))?.alive, { timeout: 15000 }).toBe(false);
    });

    test('p2가 탭을 닫고 단계가 넘어가면 → 내 화면의 p2 카드가 사망으로 바뀜 @game', async ({ user, players, table }) => {
        const { t, p2 } = await duo({ user, players, table });
        await p2.page.close();
        await c.sleep(1000);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await c.dismissOverlays(user.page);
        await expect(user.page.locator(`[data-ingame-player-nickname="${p2.account.nickname}"]`)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 20000 });
    });
});

test.describe('잠깐 끊김', () => {
    test('3초 오프라인이었다가 돌아오면 → 그사이 온 봇 채팅이 보임 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await c.readyToChat(user.page);
        await context.setOffline(true);
        const text = c.uniq('끊긴사이');
        expect((await c.botSay(t, 1, text))?.ok).toBe(true);
        await c.sleep(3000);
        await context.setOffline(false);
        await c.expectLine(user.page, t.bots[1].nickname, text, { timeout: 20000 });
    });

    test('오프라인일 때 채팅을 보내면 → 5초 뒤 "요청이 응답하지 않습니다" 오류가 뜸 @game', async ({ user, table, context }) => {
        await solo({ user, table });
        await c.readyToChat(user.page);
        await context.setOffline(true);
        await c.say(user.page, c.uniq('끊김중'), { expectCleared: false, ready: false });
        await expect(user.page.getByRole('alert').filter({ hasText: '요청이 응답하지 않습니다. 다시 시도해주세요.' })).toBeVisible({ timeout: 10000 });
        await context.setOffline(false);
    });

    test('오프라인 중 보낸 글이 시간 초과 오류가 났으면 → 다시 연결돼도 다른 사람에게 안 감 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await c.readyToChat(user.page);
        await context.setOffline(true);
        const text = c.uniq('늦은글');
        await c.say(user.page, text, { expectCleared: false, ready: false });
        await expect(user.page.getByRole('alert').filter({ hasText: '요청이 응답하지 않습니다' })).toBeVisible({ timeout: 10000 });
        await context.setOffline(false);
        await c.sleep(4000);
        // 오류를 본 사람은 안 갔다고 믿고 다시 보냄 → 늦게 가면 두 번 감
        expect(c.botGot(t, 1, 'day_chat_message_received', text)).toBe(false);
    });

    test('오프라인이 풀린 뒤 새로 보내면 → 정상으로 감 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await c.readyToChat(user.page);
        await context.setOffline(true);
        await c.sleep(2000);
        await context.setOffline(false);
        const text = c.uniq('풀린뒤');
        await c.say(user.page, text);
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('잠깐 오프라인이어도(3초) → 서버 판에서 안 빠짐 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await context.setOffline(true);
        await c.sleep(3000);
        await context.setOffline(false);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await c.sleep(1000);
        expect(await participating(t, user.account.uuid)).toBe(true);
    });

    test('오프라인 중에 밤이 되면 → 다시 연결된 뒤 밤 화면으로 맞춰짐 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table });
        await c.readyToChat(user.page);
        await context.setOffline(true);
        await c.phaseTo(t, 'NIGHT');
        await c.sleep(1000);
        await context.setOffline(false);
        await c.readyToChat(user.page);
        await expect(user.page.getByText(/\[밤-/)).toBeVisible({ timeout: 20000 });
    });

    test('오래(50초) 오프라인인 채 단계가 넘어가면 → 서버가 끊고 판에서 뺌 @game', async ({ user, table, context }) => {
        test.setTimeout(180000);
        const t = await solo({ user, table, bots: 4 });
        await context.setOffline(true);
        // socket.io 기본 ping 25초 + 대기 20초 넘게
        await c.sleep(50000);
        await c.phaseTo(t, 'NIGHT'); // 끊긴 단계(낮)가 바뀌어야 유예가 끝남
        await expect.poll(() => participating(t, user.account.uuid), { timeout: 20000 }).toBe(false);
        await context.setOffline(false);
    });
});

test.describe('새로고침 뒤 화면 도구', () => {
    test('새로고침 뒤 → 내 카드 우클릭 이모티콘이 보내짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await user.page.reload();
        await c.readyToChat(user.page);
        await c.selfCard(user.page, user.account.nickname).click({ button: 'right' });
        await user.page.getByRole('group', { name: '이모티콘 팔레트' }).getByRole('button', { name: '거절 보내기' }).click();
        await expect.poll(() => t.bots[1].events.some((r) => r.event === 'emoji_shown' && r.payload?.uuid === user.account.uuid)).toBe(true);
    });

    test('새로고침 뒤 → 다른 카드를 누르면 카드 메뉴가 열림 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await user.page.reload();
        await c.readyToChat(user.page);
        await c.card(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
    });

    test('두 사람이 같이 새로고침해도 → 서로 채팅이 오감 @game', async ({ user, players, table }) => {
        const { p2 } = await duo({ user, players, table });
        await Promise.all([user.page.reload(), p2.page.reload()]);
        await c.readyToChat(p2.page);
        const text = c.uniq('같이새로');
        await c.say(user.page, text);
        await c.expectLine(p2.page, user.account.nickname, text);
    });

    test('죽은 뒤 탭을 닫았다 다시 들어오면 → 죽은 사람 채팅을 계속 씀 @game', async ({ user, table, context }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await user.page.close();
        const page = await context.newPage();
        await page.goto('/ingame');
        const text = c.uniq('다시온죽은');
        await c.say(page, text);
        expect(await c.lineChannel(page, text)).toBe('DEAD');
    });
});

test('밤에 3초 오프라인이었다가 돌아오면 → 그사이 온 같은 직업 밤 채팅이 보임 @game', async ({ user, table, context }) => {
    const t = await solo({ user, table, phase: 'NIGHT' });
    await c.readyToChat(user.page);
    await context.setOffline(true);
    const text = c.uniq('밤끊긴사이');
    expect((await c.botNightSay(t, 1, text))?.ok).toBe(true);
    await c.sleep(3000);
    await context.setOffline(false);
    await c.expectLine(user.page, t.bots[1].nickname, text, { timeout: 20000 });
});
