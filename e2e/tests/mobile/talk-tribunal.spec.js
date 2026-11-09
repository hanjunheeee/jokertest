// 모바일 재판: 재판 연출(피고 카드·유죄/무죄·최후의 반론 채팅), 카톡 채팅방은 가려지고 끝나면 돌아옴, 판정 결과
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toVote, clearOverlays, sleep } = require('./_talk');

const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });
const tribunalChat = (page) => page.getByRole('region', { name: '최후의 반론 채팅' });
const DEFENDANT_NOTICE = '당신은 피고인입니다. 투표할 수 없습니다.';

/** 봇 하나를 재판에 올리고 재판 연출이 뜰 때까지 (봇 재판 표는 tribunal 값) */
async function botOnTrial(table, user, { tribunal = 'skip', bots = 4 } = {}) {
    const t = await startTalkGame(table, user, { bots, roles: citizenMe(user) });
    const defendant = t.bots[bots - 1];
    t.playBots({ dayVote: defendant.account.uuid, tribunal, night: 'skip' });
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
    await expect(user.page.getByRole('button', { name: '유죄' })).toBeVisible({ timeout: 20000 });
    return { t, defendant };
}

/** 내가 재판에 올라갈 때까지 */
async function meOnTrial(table, user, { tribunal = 'skip' } = {}) {
    const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
    t.playBots({ dayVote: user.account.uuid, tribunal, night: 'skip' });
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
    await expect(user.page.getByText(DEFENDANT_NOTICE)).toBeVisible({ timeout: 20000 });
    return t;
}

test.describe('재판 연출 (남이 피고)', () => {
    test('봇이 재판에 오르면 → 재판 연출에 유죄·무죄 버튼이 보임 @game', async ({ user, table }) => {
        await botOnTrial(table, user);
        await expect(user.page.getByRole('button', { name: '유죄' })).toBeEnabled();
        await expect(user.page.getByRole('button', { name: '무죄' })).toBeEnabled();
    });

    test('재판이 열리면 → 카톡 채팅방이 가려지고 바닥 입력칸도 없어짐 @game', async ({ user, table }) => {
        await botOnTrial(table, user);
        await expect(user.page.locator('[data-talk-layout] [data-slot="chat"]')).toHaveClass(/invisible/);
        await expect(tribunalChat(user.page)).toBeVisible();
        // 입력칸은 재판 채팅 안 하나만
        await expect(user.page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
        await expect(tribunalChat(user.page).getByRole('textbox', { name: '채팅 입력' })).toBeVisible();
    });

    test('재판 연출에서 "유죄"를 누르면 → 유죄·무죄 버튼 대신 "투표가 완료되었습니다." 안내가 보임 @game', async ({ user, table }) => {
        await botOnTrial(table, user);
        await user.page.getByRole('button', { name: '유죄' }).click();
        await expect(user.page.getByText('투표가 완료되었습니다.')).toBeVisible();
        await expect(user.page.getByRole('button', { name: '유죄' })).toHaveCount(0);
    });

    test('재판 연출에서 "무죄"를 누르면 → 무죄 버튼이 사라지고 "투표가 완료되었습니다." 안내가 보임 @game', async ({ user, table }) => {
        await botOnTrial(table, user);
        await user.page.getByRole('button', { name: '무죄' }).click();
        await expect(user.page.getByText('투표가 완료되었습니다.')).toBeVisible();
        await expect(user.page.getByRole('button', { name: '무죄' })).toHaveCount(0);
    });

    test('봇 피고가 최후의 반론을 말하면 → 재판 채팅 내역에 보임 @game', async ({ user, table }) => {
        const { t, defendant } = await botOnTrial(table, user);
        await defendant.request('submit_game_chat_message', { gameId: t.gameId, text: '저는 결백합니다' });
        await expect(tribunalChat(user.page).getByRole('log', { name: '채팅 내역' })).toContainText('저는 결백합니다');
    });

    test('봇들이 유죄를 많이 내면 → 피고가 처형되고 채팅방에 죽음 줄이 뜸 @game', async ({ user, table }) => {
        const { t, defendant } = await botOnTrial(table, user, { tribunal: 'GUILTY' });
        await t.advanceUntil((s) => s.players.find((p) => p.uuid === defendant.account.uuid)?.alive === false, { stepDelayMs: 1200 });
        await expect(user.page.locator('[data-talk-layout] [data-slot="chat"]')).not.toHaveClass(/invisible/, { timeout: 30000 });
        await clearOverlays(user.page);
        await expect(talk.system(user.page).filter({ hasText: `${defendant.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 15000 });
    });

    test('봇들이 무죄를 많이 내면 → 피고가 살아남고 밤이 됨 @game', async ({ user, table }) => {
        const { t, defendant } = await botOnTrial(table, user, { tribunal: 'NOT_GUILTY' });
        const s = await t.advanceUntil('NIGHT', { stepDelayMs: 1200 });
        expect(s.players.find((p) => p.uuid === defendant.account.uuid).alive).toBe(true);
        await expect(talk.phaseLine(user.page)).toContainText('밤', { timeout: 20000 });
        await expect(talk.slot(user.page, defendant.nickname)).toHaveAccessibleName(defendant.nickname);
    });

    test('재판이 끝나면 → 카톡 채팅방과 바닥 입력칸이 다시 보임 @game', async ({ user, table }) => {
        const { t } = await botOnTrial(table, user, { tribunal: 'NOT_GUILTY' });
        await t.advanceUntil('NIGHT', { stepDelayMs: 1200 });
        await expect(user.page.locator('[data-talk-layout] [data-slot="chat"]')).not.toHaveClass(/invisible/, { timeout: 30000 });
        await clearOverlays(user.page);
        await expect(talk.chat(user.page)).toBeVisible();
        await expect(talk.input(user.page)).toBeVisible();
    });

});

test.describe('재판 연출 (내가 피고)', () => {
    test('내가 재판에 오르면 → "당신은 피고인입니다" 안내가 뜨고 유죄·무죄 버튼이 없음 @game', async ({ user, table }) => {
        await meOnTrial(table, user);
        await expect(user.page.getByRole('button', { name: '유죄' })).toHaveCount(0);
        await expect(tribunalChat(user.page)).toBeVisible();
    });

    test('피고인 내가 최후의 반론 채팅에 쓰면 → 재판 채팅 내역에 내 말이 보임 @game', async ({ user, table }) => {
        await meOnTrial(table, user);
        const box = tribunalChat(user.page);
        await box.getByRole('textbox', { name: '채팅 입력' }).fill('최후의 반론입니다');
        await box.getByRole('button', { name: '채팅 보내기' }).click();
        await expect(box.getByRole('log', { name: '채팅 내역' })).toContainText('최후의 반론입니다');
    });

    test('봇들이 유죄를 내서 내가 처형되면 → "사망 후 선택" 창이 뜸 @game', async ({ user, table }) => {
        const t = await meOnTrial(table, user, { tribunal: 'GUILTY' });
        await t.advanceUntil((s) => s.players.find((p) => p.uuid === user.account.uuid)?.alive === false, { stepDelayMs: 1200 });
        await expect(talk.deadChoice(user.page)).toBeVisible({ timeout: 30000 });
        await expect(talk.deadChoice(user.page).getByText('당신은 사망했습니다.')).toBeVisible();
    });
});

test.describe('재판 사람 둘', () => {
    test('다른 모바일 사람이 피고면 → 그 사람의 최후의 반론이 내 재판 채팅에 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        t.playBots({ dayVote: p2.account.uuid, tribunal: 'skip', night: 'skip' });
        await toVote(t, [user.page, p2.page]);
        await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
        await expect(p2.page.getByText(DEFENDANT_NOTICE)).toBeVisible({ timeout: 20000 });
        const box = tribunalChat(p2.page);
        await box.getByRole('textbox', { name: '채팅 입력' }).fill('살려 주세요');
        await box.getByRole('button', { name: '채팅 보내기' }).click();
        await expect(tribunalChat(user.page).getByRole('log', { name: '채팅 내역' })).toContainText('살려 주세요', { timeout: 15000 });
        await sleep(100);
    });
});
