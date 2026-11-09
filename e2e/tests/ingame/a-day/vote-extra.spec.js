// 낮 투표·재판 더 보기: 여러 번 바꾸기, 메뉴 옮기기, 새로고침 뒤 표·준비·재판 상태가 남는지, 판 밖 사람의 표·채팅 거절
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const u = (x) => x.account.uuid;
const abstainBtn = (page) => page.getByRole('button', { name: '기권' });
const menu = (page) => page.getByRole('menu', { name: '플레이어 행동' });
const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판' });

async function voteTable(table, user, { bots = 4, humans = [user] } = {}) {
    const t = await table.setup({ humans, bots, settings: { dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await L.toDay(t);
    await L.toVote(t);
    return t;
}

async function toTribunal(t, defendantUuid) {
    await L.botsVote(t, defendantUuid, t.bots.filter((b) => u(b) !== defendantUuid));
    await L.resolveVote(t);
}

test.describe('표 바꾸기 더', () => {
    test('세 번 바꿔 찍으면 → 마지막에 찍은 사람만 표를 받음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.cardAction(user.page, t.bots[2].nickname, '투표하기');
        await L.sleep(400);
        await L.cardAction(user.page, t.bots[3].nickname, '투표하기');
        await L.sleep(400);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[1], u(t.bots[2])]]);
        // 마지막 표(봇3)만 셈이면 1:1:1 동점 → 밤 (첫째·둘째 표가 남았으면 2표로 재판)
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });

    test('찍고 → 투표취소 → 같은 사람을 다시 찍으면 → 그 표가 다시 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.cardAction(user.page, t.bots[1].nickname, '투표취소');
        await L.sleep(400);
        await L.cardAction(user.page, t.bots[1].nickname, '투표하기');
        await L.sleep(400);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[1]));
    });

    test('A 카드 메뉴를 연 채 B 카드를 누르면 → 메뉴가 B 쪽으로 옮겨 하나만 열림 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(L.card(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'true');
        await L.card(user.page, t.bots[2].nickname).click();
        await expect(menu(user.page)).toHaveCount(1);
        await expect(L.card(user.page, t.bots[2].nickname)).toHaveAttribute('aria-expanded', 'true');
        await expect(L.card(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'false');
    });

    test('첫날 카드로 찍은 사람도 → 둘째 날 투표에서 기권 버튼이 켜져 있음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.botsVote(t, [[t.bots[0], u(t.bots[2])]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await L.toVote(t);
        await expect(abstainBtn(user.page)).toBeEnabled();
    });

    test('토론 중에는 → 기권 버튼이 아직 없음 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 2 });
        await L.toDay(t);
        await expect(abstainBtn(user.page)).toHaveCount(0);
    });

    test('투표가 마감되어 밤이 되면 → 기권 버튼이 사라짐 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(abstainBtn(user.page)).toHaveCount(0);
    });

    test('재판 중에는 → 투표 현황 버튼이 재판 창 뒤에 잠겨 못 누름 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toBeVisible();
        expect(await user.page.getByRole('button', { name: '투표 현황 열기' }).evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    });

    test('재판 창의 피고 카드에는 → 아직 \'사망\' 표시가 없음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await expect(tribunalDialog(user.page)).toContainText(t.bots[2].nickname);
        await expect(tribunalDialog(user.page)).not.toContainText('사망');
    });

    test('두 사람 중 한 사람이 피고일 때 다른 사람이 무죄를 내고 봇이 1:1이면 → 피고가 풀려남 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await voteTable(table, user, { humans: [user, p2], bots: 3 });
        await toTribunal(t, u(p2));
        await expect(tribunalDialog(p2.page)).toContainText('당신은 피고인입니다');
        await L.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'NOT_GUILTY']]);
        await tribunalDialog(user.page).getByRole('button', { name: '무죄', exact: true }).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        const s = await L.resolveTribunal(t);
        expect(L.playerOf(s, u(p2)).alive).toBe(true);
    });
});

test.describe('새로고침 뒤', () => {
    test('낮 투표 중 새로고침하면 → 다시 판 화면이 뜨고 기권 버튼이 보임 @game', async ({ user, table }) => {
        await voteTable(table, user);
        await user.page.reload();
        await expect(abstainBtn(user.page)).toBeVisible({ timeout: 20000 });
    });

    test('찍은 뒤 새로고침해도 → 서버에 남은 내 표로 결과가 남 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[2].nickname);
        await user.page.reload();
        await expect(abstainBtn(user.page)).toBeVisible({ timeout: 20000 });
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('준비를 누르고 새로고침해도 → 봇이 다 준비하면 투표로 넘어감 (내 준비가 남음) @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 4, settings: { dayDiscussionTime: 150 } });
        await L.toDay(t);
        await user.page.getByRole('button', { name: '투표 시작 준비' }).click();
        await expect(user.page.getByRole('button', { name: '준비 완료' })).toBeVisible();
        await user.page.reload();
        await expect(user.page.getByLabel('제 1일 시간 흐름')).toBeVisible({ timeout: 20000 });
        for (const bot of t.bots) await bot.request('ready_for_day_vote', { gameId: t.gameId });
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
    });

    test('재판 중 새로고침하면 → 재판 창이 다시 뜸 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await user.page.reload();
        await expect(tribunalDialog(user.page)).toContainText(t.bots[2].nickname, { timeout: 20000 });
    });

    test('재판 표를 낸 뒤 새로고침해도 → \'투표가 완료되었습니다.\'가 보이고 다시 낼 버튼이 없음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        await tribunalDialog(user.page).getByRole('button', { name: '유죄', exact: true }).click();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await user.page.reload();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.', { timeout: 20000 });
        await expect(tribunalDialog(user.page).getByRole('button', { name: '유죄', exact: true })).toHaveCount(0);
    });

    test('피고인 내가 새로고침해도 → 피고 안내가 그대로 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, user.account.uuid);
        await user.page.reload();
        await expect(tribunalDialog(user.page)).toContainText('당신은 피고인입니다. 투표할 수 없습니다.', { timeout: 20000 });
    });

    test('새로고침한 뒤에도 → 봇이 보낸 새 채팅이 보임 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 3, settings: { dayDiscussionTime: 150 } });
        await L.toDay(t);
        await user.page.reload();
        await expect(user.page.getByLabel('제 1일 시간 흐름')).toBeVisible({ timeout: 20000 });
        await L.sleep(800);
        await L.botChat(t, t.bots[1], '새로고침 뒤 말');
        await expect(L.chatLog(user.page)).toContainText('새로고침 뒤 말');
    });
});

test.describe('판 밖 사람', () => {
    test('판에 없는 봇이 이 판에 낮 표를 내면 → 거절됨 @game', async ({ user, table, bots }) => {
        const t = await voteTable(table, user);
        const [outsider] = await bots.spawn(1);
        const r = await outsider.request('cast_day_vote', { gameId: t.gameId, targetId: u(t.bots[1]) });
        expect(r.ok).toBe(false);
    });

    test('판에 없는 봇이 이 판에 재판 표를 내면 → 거절됨 @game', async ({ user, table, bots }) => {
        const t = await voteTable(table, user);
        await toTribunal(t, u(t.bots[2]));
        const [outsider] = await bots.spawn(1);
        const r = await outsider.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: 1, vote: 'GUILTY' });
        expect(r.ok).toBe(false);
    });

    test('판에 없는 봇이 이 판에 채팅을 보내면 → 거절되고 사람 화면에 안 보임 @game', async ({ user, table, bots }) => {
        const t = await voteTable(table, user);
        const [outsider] = await bots.spawn(1);
        const r = await outsider.request('submit_game_chat_message', { gameId: t.gameId, text: '끼어들기' });
        expect(r.ok).toBe(false);
        await L.sleep(500);
        await expect(L.chatLog(user.page)).not.toContainText('끼어들기');
    });

    test('판에 없는 봇이 투표 준비를 보내면 → 거절됨 @game', async ({ user, table, bots }) => {
        const t = await table.setup({ humans: [user], bots: 2 });
        await L.toDay(t);
        const [outsider] = await bots.spawn(1);
        const r = await outsider.request('ready_for_day_vote', { gameId: t.gameId });
        expect(r.ok).toBe(false);
    });

    test('두 판이 동시에 돌 때 한 판의 채팅은 → 다른 판 사람에게 안 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t1 = await table.setup({ humans: [user], bots: 2, settings: { dayDiscussionTime: 150 } });
        const t2 = await table.setup({ humans: [p2], bots: 2, settings: { dayDiscussionTime: 150 } });
        await L.toDay(t1);
        await L.toDay(t2);
        await L.botChat(t1, t1.bots[1], '첫째 판 말');
        await expect(L.chatLog(user.page)).toContainText('첫째 판 말');
        await L.sleep(500);
        await expect(L.chatLog(p2.page)).not.toContainText('첫째 판 말');
    });
});
