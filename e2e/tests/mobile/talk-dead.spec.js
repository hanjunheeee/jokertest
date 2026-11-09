// 모바일 죽은 뒤: 사망 후 선택 창(관전·나가기), "죽은 사람끼리" 띠·회색 말풍선(낮·밤), 산 사람은 못 봄, 죽은 사람 행동 막힘
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, goPhase, getExecuted, say, botSay, clearOverlays, bgColor, sleep } = require('./_talk');

const body = (li) => li.locator('p.whitespace-pre-wrap');
const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });

async function deadMe(table, user, o = {}) {
    const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
    await getExecuted(t, user.account.uuid, { pages: [user.page], ...o });
    return t;
}

test.describe('사망 후 선택 창', () => {
    test('내가 처형되면 → "사망 후 선택" 창에 관전 계속하기·게임 나가기 버튼이 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        t.playBots({ dayVote: user.account.uuid, tribunal: 'GUILTY', night: 'skip' });
        await t.advanceUntil((g) => g.players.find((p) => p.uuid === user.account.uuid)?.alive === false, { stepDelayMs: 1200 });
        const dialog = talk.deadChoice(user.page);
        await expect(dialog).toBeVisible({ timeout: 30000 });
        await expect(dialog.getByRole('button', { name: '관전 계속하기' })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: '게임 나가기' })).toBeEnabled();
        const box = await dialog.locator('div').first().boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(375);
    });

    test('"관전 계속하기"를 누르면 → 창이 닫히고 카톡형 판 화면을 계속 봄 @game', async ({ user, table }) => {
        await deadMe(table, user);
        await expect(talk.deadChoice(user.page)).toHaveCount(0);
        await expect(talk.layout(user.page)).toBeVisible();
        await expect(user.page).toHaveURL(/\/ingame/);
    });

    test('"게임 나가기"를 누르고 확인하면 → 판 화면을 떠남 @game', async ({ user, table }) => {
        await deadMe(table, user, { keepWatching: false });
        const dialog = talk.deadChoice(user.page);
        await expect(dialog).toBeVisible();
        user.page.once('dialog', (d) => d.accept());
        await dialog.getByRole('button', { name: '게임 나가기' }).click();
        await expect(user.page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
    });

    test('"게임 나가기"를 누르고 확인 창에서 취소하면 → 판 화면에 그대로 남음 @game', async ({ user, table }) => {
        await deadMe(table, user, { keepWatching: false });
        user.page.once('dialog', (d) => d.dismiss());
        await talk.deadChoice(user.page).getByRole('button', { name: '게임 나가기' }).click();
        await sleep(1000);
        await expect(user.page).toHaveURL(/\/ingame/);
    });
});

test.describe('죽은 사람끼리 채팅', () => {
    test('내가 죽으면 → 채팅방 위에 "죽은 사람끼리" 띠가 보이고 밤 띠는 없음 @game', async ({ user, table }) => {
        await deadMe(table, user);
        await expect(talk.deadBanner(user.page)).toBeVisible();
        await expect(talk.nightBanner(user.page)).toHaveCount(0);
    });

    test('내가 죽으면 → 초상 띠 내 칸 이름이 "닉네임, 나, 사망" @game', async ({ user, table }) => {
        await deadMe(table, user);
        await expect(talk.mySlot(user.page)).toHaveAccessibleName(`${user.account.nickname}, 나, 사망`);
    });

    test('내가 죽으면 → 채팅방에 내 죽음 시스템 줄이 뜸 @game', async ({ user, table }) => {
        await deadMe(table, user);
        await expect(talk.system(user.page).filter({ hasText: `${user.account.nickname}님이 죽었습니다` })).toBeVisible();
    });

    test('죽은 내가 말하면 → 회색 말풍선(내 것)으로 오른쪽에 보임 @game', async ({ user, table }) => {
        await deadMe(table, user);
        await say(user.page, '죽은 내 말');
        expect(await bgColor(body(talk.mine(user.page).filter({ hasText: '죽은 내 말' })))).toBe('rgb(90, 90, 90)');
    });

    test('죽은 나는 밤에도 → 밤 대기 창에 안 막히고 죽은 사람끼리 말할 수 있음 @game', async ({ user, table }) => {
        const t = await deadMe(table, user);
        const s = await t.state();
        if (s.phase !== 'NIGHT') await goPhase(t, user.page, 'NIGHT');
        await clearOverlays(user.page);
        await expect(user.page.locator('[data-ingame-night-presentation-wait]')).toHaveCount(0);
        await say(user.page, '밤의 죽은 말');
        await expect(talk.deadBanner(user.page)).toBeVisible();
    });

    test('죽은 봇이 말하면 → 죽은 내 화면에 회색 말풍선으로 왼쪽에 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        // 나를 먼저 처형, 다음 날 봇 하나 처형 → 그 봇이 죽은 사람 채팅
        await getExecuted(t, user.account.uuid, { pages: [user.page] });
        const victim = t.bots[3];
        await t.stopBots();
        t.playBots({ dayVote: victim.account.uuid, tribunal: 'GUILTY', night: 'skip' });
        await t.advanceUntil((g) => g.players.find((p) => p.uuid === victim.account.uuid)?.alive === false, { stepDelayMs: 1200, maxSteps: 60 });
        await clearOverlays(user.page);
        await botSay(t, 3, '죽은 봇의 말');
        const li = talk.others(user.page).filter({ hasText: '죽은 봇의 말' });
        await expect(li).toBeVisible({ timeout: 15000 });
        expect(await bgColor(body(li))).toBe('rgb(58, 58, 58)');
    });

    test('죽은 나는 → 산 봇의 낮 말도 보통 말풍선 색으로 같이 봄 @game', async ({ user, table }) => {
        const t = await deadMe(table, user);
        await goPhase(t, user.page, (s) => s.phase === 'DAY' && s.dayIndex === 2, { line: '제 2일' });
        await botSay(t, 1, '산 봇의 낮 말');
        const li = talk.others(user.page).filter({ hasText: '산 봇의 낮 말' });
        await expect(li).toBeVisible();
        expect(await bgColor(body(li))).toBe('rgb(239, 226, 196)');
    });

    test('죽은 사람끼리 말은 → 살아 있는 두 번째 사람 화면엔 안 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        await getExecuted(t, user.account.uuid, { pages: [user.page] });
        await clearOverlays(p2.page);
        await say(user.page, '산 사람은 못 봄');
        await sleep(1500);
        await expect(talk.log(p2.page)).not.toContainText('산 사람은 못 봄');
        await expect(talk.deadBanner(p2.page)).toHaveCount(0);
    });
});

test.describe('죽은 사람 행동 막힘', () => {
    test('죽은 내가 낮 투표에 봇 칸을 누르면 → "투표하기"가 꺼지고 "사망한 플레이어는 행동할 수 없습니다"가 보임 @game', async ({ user, table }) => {
        const t = await deadMe(table, user);
        await goPhase(t, user.page, (s) => s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
        await talk.slot(user.page, t.bots[1].nickname).click();
        const sheet = user.page.getByRole('dialog', { name: t.bots[1].nickname });
        await expect(sheet.getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
        await expect(sheet.getByText('사망한 플레이어는 행동할 수 없습니다')).toBeVisible();
    });

    test('죽은 나는 낮 투표에서 → "기권" 버튼도 꺼져 있음 @game', async ({ user, table }) => {
        const t = await deadMe(table, user);
        await goPhase(t, user.page, (s) => s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
        await expect(user.page.getByRole('button', { name: '기권' })).toBeDisabled();
    });

    test('죽은 내가 이모티콘을 보내 봐도 → 판에 이모티콘이 안 뜸 @game', async ({ user, table }) => {
        await deadMe(table, user);
        await talk.mySlot(user.page).dispatchEvent('contextmenu');
        const palette = talk.palette(user.page);
        if (await palette.isVisible().catch(() => false)) {
            await palette.getByRole('button', { name: '안녕 보내기' }).click();
        }
        await sleep(1500);
        await expect(talk.log(user.page).locator('[data-talk-emoji]')).toHaveCount(0);
        await expect(talk.mySlot(user.page).locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
    });
});

test.describe('죽은 뒤 화면 배치', () => {

});
