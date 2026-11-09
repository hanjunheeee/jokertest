// 모바일 카톡형 시스템 줄: 처형·밤 사망·연결 끊김 소식을 채팅방 가운데 반투명 줄로 (말풍선과 섞이지 않게)
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, botSay, botLeave, executeBot, clearOverlays, goPhase } = require('./_talk');

const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });

test.describe('시스템 줄', () => {
    test('막 판에 들어왔을 땐 → 채팅방에 시스템 줄이 하나도 없음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3 });
        await toDay(t, user.page);
        await expect(talk.system(user.page)).toHaveCount(0);
    });

    test('봇이 처형되면 → 채팅방에 "닉네임님이 죽었습니다" 시스템 줄이 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        const victim = t.bots[3];
        await executeBot(t, victim.account.uuid);
        await clearOverlays(user.page);
        await expect(talk.system(user.page).filter({ hasText: `${victim.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 20000 });
    });

    test('시스템 줄은 → 채팅방 가운데에 있고 초상·닉네임 없는 한 줄 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        const victim = t.bots[3];
        await executeBot(t, victim.account.uuid);
        await clearOverlays(user.page);
        const line = talk.system(user.page).filter({ hasText: victim.nickname });
        await expect(line).toBeVisible({ timeout: 20000 });
        const box = await line.locator('p').boundingBox();
        const panel = await talk.chat(user.page).boundingBox();
        const center = box.x + box.width / 2;
        expect(Math.abs(center - (panel.x + panel.width / 2))).toBeLessThan(12);
        await expect(line.locator('p.truncate')).toHaveCount(0);
    });

    test('광대 봇이 밤에 봇을 죽이면 → 아침 채팅방에 그 봇 죽음 시스템 줄이 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        const victim = t.bots[3];
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: victim.account.uuid });
        await t.advanceUntil((s) => s.players.find((p) => p.uuid === victim.account.uuid)?.alive === false, { stepDelayMs: 1200, maxSteps: 30 });
        await goPhase(t, user.page, 'DAY', { line: '제 2일' });
        await expect(talk.system(user.page).filter({ hasText: `${victim.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 20000 });
    });

    test('봇 연결이 끊기면 → 채팅방에 "닉네임님의 연결이 끊겼습니다" 시스템 줄이 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3 });
        await toDay(t, user.page);
        const bot = t.bots[2];
        await bot.close();
        await expect(talk.system(user.page).filter({ hasText: `${bot.nickname}님의 연결이 끊겼습니다` })).toBeVisible({ timeout: 20000 });
    });

    test('봇이 게임에서 나가면 → 나간 봇이 죽은 것으로 바뀌어 "닉네임님이 죽었습니다" 줄이 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        await toDay(t, user.page);
        const bot = t.bots[2];
        await botLeave(t, 2);
        await expect(talk.system(user.page).filter({ hasText: `${bot.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 20000 });
        await expect(talk.slot(user.page, bot.nickname)).toHaveAccessibleName(`${bot.nickname}, 사망`);
    });

    test('봇 둘이 차례로 나가면 → 시스템 줄이 사람마다 하나씩 두 개 생김 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        await toDay(t, user.page);
        await botLeave(t, 2);
        await botLeave(t, 3);
        await expect(talk.system(user.page).filter({ hasText: '님이 죽었습니다' })).toHaveCount(2, { timeout: 20000 });
    });

    test('시스템 줄이 끼면 → 그 뒤 같은 봇이 이어 말해도 닉네임이 다시 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        await toDay(t, user.page);
        await botSay(t, 0, '나가기 전');
        await botLeave(t, 2);
        await expect(talk.system(user.page)).toHaveCount(1, { timeout: 20000 });
        await botSay(t, 0, '나간 뒤');
        await expect(talk.others(user.page).filter({ hasText: '나간 뒤' }).locator('p.truncate')).toHaveText(t.bots[0].nickname);
    });

    test('시스템 줄은 → 시각 순서대로 말풍선 사이에 끼어 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        await toDay(t, user.page);
        await botSay(t, 0, '앞의 말');
        await botLeave(t, 2);
        await expect(talk.system(user.page)).toHaveCount(1, { timeout: 20000 });
        await botSay(t, 1, '뒤의 말');
        const kinds = await talk.lines(user.page).evaluateAll((els) => els.map((el) => `${el.dataset.talkLine}:${el.innerText.trim().split('\n').pop()}`));
        const a = kinds.findIndex((k) => k.endsWith('앞의 말'));
        const s = kinds.findIndex((k) => k.startsWith('system'));
        const b = kinds.findIndex((k) => k.endsWith('뒤의 말'));
        expect(a).toBeLessThan(s);
        expect(s).toBeLessThan(b);
    });

    test('같은 판 두 번째 사람이 게임을 나가면 → 내 화면에 그 사람 죽음 줄이 뜨고 그 사람은 판 밖 화면으로 감 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 2 });
        await toDay(t, [user.page, p2.page]);
        p2.page.once('dialog', (d) => d.accept());
        await p2.page.getByRole('button', { name: '게임 나가기' }).click();
        await expect(p2.page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
        await expect(talk.system(user.page).filter({ hasText: `${p2.account.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 20000 });
    });

    test('재판 연출로 채팅방이 가려진 사이 처형이 나도 → 연출이 끝나면 채팅방에 죽음 줄이 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        const victim = t.bots[3];
        t.playBots({ dayVote: victim.account.uuid, tribunal: 'GUILTY', night: 'skip' });
        await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
        await expect(user.page.locator('[data-slot="chat"]')).toHaveClass(/invisible/, { timeout: 15000 });
        await t.advanceUntil((s) => s.players.find((p) => p.uuid === victim.account.uuid)?.alive === false, { stepDelayMs: 1200 });
        await expect(user.page.locator('[data-slot="chat"]')).not.toHaveClass(/invisible/, { timeout: 30000 });
        await clearOverlays(user.page);
        await expect(talk.system(user.page).filter({ hasText: `${victim.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 20000 });
    });
});
