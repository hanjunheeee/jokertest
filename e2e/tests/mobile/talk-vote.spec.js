// 모바일 낮 투표·투표 현황: 투표 시작 준비 → 카드 시트 투표하기·투표취소 → 기권 → 투표 현황 창(집계 전·재판 회부·동점·기권 다수)
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote, toNight, clearOverlays, goPhase } = require('./_talk');

const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });

async function openSheet(page, nickname) {
    await talk.slot(page, nickname).click();
    const sheet = page.getByRole('dialog', { name: nickname });
    await expect(sheet).toBeVisible();
    return sheet;
}

async function openVoteStatus(page) {
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(dialog).toBeVisible();
    return dialog;
}

test.describe('투표 시작 준비', () => {
    test('토론 중 "투표 시작 준비"를 누르면 → "준비 완료"로 바뀌고 다시 못 누름 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        const ready = talk.phaseAction(user.page, 'dayReady');
        await ready.click();
        await expect(ready).toHaveText('준비 완료');
        await expect(ready).toBeDisabled();
    });

    test('봇이 다 준비한 뒤 나도 준비하면 → 토론이 끝나고 낮 투표로 넘어감 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: true, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await talk.phaseAction(user.page, 'dayReady').click();
        await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => (await t.state()).dayPhase).toBe('DAY_VOTE');
    });
});

test.describe('낮 투표 (카드 시트)', () => {
    test('낮 투표에서 봇 카드 "투표하기"를 누르면 → 시트가 닫히고 다시 열면 "투표취소"가 됨 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        const bot = t.bots[1].nickname;
        await (await openSheet(user.page, bot)).getByRole('menuitem', { name: '투표하기' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        await expect((await openSheet(user.page, bot)).getByRole('menuitem', { name: '투표취소' })).toBeEnabled();
    });

    test('"투표취소"를 누르면 → 다시 열었을 때 "투표하기"로 돌아옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        const bot = t.bots[1].nickname;
        await (await openSheet(user.page, bot)).getByRole('menuitem', { name: '투표하기' }).click();
        await (await openSheet(user.page, bot)).getByRole('menuitem', { name: '투표취소' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
        await expect((await openSheet(user.page, bot)).getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    });

    test('투표하고 나면 → 행동 줄 "기권" 버튼이 꺼짐 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await (await openSheet(user.page, t.bots[1].nickname)).getByRole('menuitem', { name: '투표하기' }).click();
        await expect(user.page.getByRole('button', { name: '기권' })).toBeDisabled();
    });

    test('낮 투표에서 "기권"을 누르면 → 기권 버튼이 꺼짐 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        const abstain = user.page.getByRole('button', { name: '기권' });
        await abstain.click();
        await expect(abstain).toBeDisabled();
    });

    test('봇들과 같이 한 봇을 찍으면 → 그 봇이 재판에 회부됨 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        const target = t.bots[2];
        t.playBots({ dayVote: target.account.uuid, tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await (await openSheet(user.page, target.nickname)).getByRole('menuitem', { name: '투표하기' }).click();
        const s = await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
        expect(s.tribunal.defendantUuid).toBe(target.account.uuid);
    });

});

test.describe('투표 현황 창', () => {
    test('집계 전에 "투표 현황"을 누르면 → 투표 현황 창에 "집계 전"이 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        const dialog = await openVoteStatus(user.page);
        await expect(dialog.getByText('각 플레이어가 받은 투표 수입니다.')).toBeVisible();
        await expect(dialog.getByTestId('vote-status-unresolved')).toHaveText('집계 전');
    });

    test('투표 현황 창의 닫기 버튼을 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        const dialog = await openVoteStatus(user.page);
        await dialog.getByRole('button', { name: '투표 현황 닫기' }).click();
        await expect(user.page.getByRole('dialog', { name: '투표 현황' })).toHaveCount(0);
    });

    test('투표 현황 창에서 Esc를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await openVoteStatus(user.page);
        await user.page.keyboard.press('Escape');
        await expect(user.page.getByRole('dialog', { name: '투표 현황' })).toHaveCount(0);
    });

    test('투표 현황 창은 → 375 폭 화면 안에 다 들어옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        const box = await (await openVoteStatus(user.page)).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(376);
    });

    test('재판 회부로 집계가 끝나면 → 투표 현황에 결과 "재판 회부"와 재판 대상 닉네임이 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        const target = t.bots[2];
        t.playBots({ dayVote: target.account.uuid, tribunal: 'NOT_GUILTY', night: 'skip' });
        await toVote(t, user.page);
        await t.advanceUntil('TRIBUNAL', { stepDelayMs: 1200 });
        await toNight(t, user.page, { stepDelayMs: 1200 });
        const dialog = await openVoteStatus(user.page);
        await expect(dialog.getByTestId('vote-status-outcome')).toHaveText('재판 회부');
        await expect(dialog.getByTestId('vote-status-tribunal-target')).toHaveText(target.nickname);
        await expect(dialog.getByTestId('vote-status-public-vote-count')).not.toHaveText('-');
    });

    test('모두 기권해서 집계가 끝나면 → 투표 현황 결과가 "기권 다수"이고 재판 대상은 "없음" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'abstain', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await user.page.getByRole('button', { name: '기권' }).click();
        await toNight(t, user.page, { stepDelayMs: 1200 });
        const dialog = await openVoteStatus(user.page);
        await expect(dialog.getByTestId('vote-status-outcome')).toHaveText('기권 다수');
        await expect(dialog.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
    });

    test('표가 둘로 똑같이 갈리면 → 재판 없이 밤이 되고 투표 현황 결과가 "동점" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: citizenMe(user) });
        const [a, b] = [t.bots[1], t.bots[2]];
        // 봇0·봇1 → 봇2, 봇2 → 봇1, 나 → 봇1 : 2 대 2
        t.playBots((bot) => ({ dayVote: bot === b ? a.account.uuid : b.account.uuid, tribunal: 'skip', night: 'skip' }));
        await toVote(t, user.page);
        await (await openSheet(user.page, a.nickname)).getByRole('menuitem', { name: '투표하기' }).click();
        await expect((await openSheet(user.page, a.nickname)).getByRole('menuitem', { name: '투표취소' })).toBeVisible();
        await user.page.keyboard.press('Escape');
        const s = await toNight(t, user.page, { stepDelayMs: 1200 });
        expect(s.phase).toBe('NIGHT');
        const dialog = await openVoteStatus(user.page);
        await expect(dialog.getByTestId('vote-status-outcome')).toHaveText('동점');
    });
});

test.describe('사람 둘 투표', () => {
    test('모바일 두 사람이 같은 봇을 찍고 봇들도 찍으면 → 그 봇이 재판에 올라감 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 3, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        const target = t.bots[2];
        t.playBots({ dayVote: target.account.uuid, tribunal: 'skip', night: 'skip' });
        await toVote(t, [user.page, p2.page]);
        for (const page of [user.page, p2.page]) {
            await (await openSheet(page, target.nickname)).getByRole('menuitem', { name: '투표하기' }).click();
        }
        const s = await goPhase(t, [user.page, p2.page], 'TRIBUNAL', { stepDelayMs: 1200 });
        expect(s.tribunal.defendantUuid).toBe(target.account.uuid);
        await clearOverlays(user.page);
    });
});
