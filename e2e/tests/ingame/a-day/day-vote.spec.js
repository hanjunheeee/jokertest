// 낮 투표 시험: 카드로 찍기·바꾸기·투표취소·기권, 투표 현황 창, 결과(최다 → 재판, 동점·전원 기권 → 바로 밤, 재투표 없음), 죽은 사람·나 자신 찍기 막힘, 인원 5~10명
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const abstainBtn = (page) => page.getByRole('button', { name: '기권' });
const menu = (page) => page.getByRole('menu', { name: '플레이어 행동' });
const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판' });
const statusValue = (dialog, id) => dialog.getByTestId(`vote-status-${id}`);
const u = (bot) => bot.account.uuid;

// 사람(시민) + 봇 n, 첫 봇이 광대, 낮 투표까지
async function voteTable(table, user, { bots = 4, humans = [user], settings = {} } = {}) {
    const t = await table.setup({ humans, bots, settings: { dayDiscussionTime: 150, dayVoteTime: 90, ...settings }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await L.toDay(t);
    await L.toVote(t);
    return t;
}

// 첫날 봇 하나(또는 나) 처형 → 둘째 날 낮 투표까지
async function toDay2Vote(t, victimUuid, page) {
    const voters = t.bots.filter((b) => u(b) !== victimUuid);
    await L.botsVote(t, victimUuid, voters);
    await L.resolveVote(t);
    await L.botsTribunal(t, 'GUILTY', voters);
    await L.resolveTribunal(t);
    if (victimUuid === t.humans[0].account.uuid) await L.keepWatching(page);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
    await L.closeNotice(page, '낮이 되었습니다');
    await L.toVote(t);
}

test.describe('카드로 찍기', () => {
    test('낮 투표 중 다른 사람 카드를 누르면 → \'투표하기\' 메뉴가 켜진 채 뜸 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(menu(user.page).getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    });

    test('내 카드를 누르면 → 행동 메뉴가 안 뜸 (나 자신은 못 찍음) @game', async ({ user, table }) => {
        await voteTable(table, user);
        await L.selfCard(user.page, user.account.nickname).click();
        await expect(menu(user.page)).toHaveCount(0);
    });

    test('투표하기를 누르면 → 기권 버튼이 잠기고 같은 카드 메뉴는 \'투표취소\'로 바뀜 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(menu(user.page).getByRole('menuitem', { name: '투표취소' })).toBeEnabled();
    });

    test('한 사람을 찍은 뒤 다른 사람 카드를 누르면 → 그 카드에는 \'투표하기\'가 보임 (바꾸기) @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.card(user.page, t.bots[2].nickname).click();
        await expect(menu(user.page).getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    });

    test('A를 찍었다가 B로 바꾸면 → 마지막 표(B)만 세어져 B가 재판에 섬 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.cardAction(user.page, t.bots[2].nickname, '투표하기');
        await L.sleep(500);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('TRIBUNAL');
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('찍은 카드에서 투표취소를 누르면 → 기권으로 바뀌어 그 사람 표가 빠짐 (1:1 동점 → 밤) @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.cardAction(user.page, t.bots[1].nickname, '투표취소');
        await L.sleep(500);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });

    test('기권 버튼을 누르면 → 버튼이 잠기고 내 표는 기권으로 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await abstainBtn(user.page).click();
        await expect(abstainBtn(user.page)).toBeDisabled();
        await L.botsVote(t, null);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'public-abstain-count')).toHaveText('5');
    });

    test('기권한 뒤에도 카드로 찍으면 → 그 표로 바뀌어 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await abstainBtn(user.page).click();
        await expect(abstainBtn(user.page)).toBeDisabled();
        await L.cardAction(user.page, t.bots[1].nickname, '투표하기');
        await L.sleep(500);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[1]));
    });

    test('투표 메뉴가 열린 채 Esc를 누르면 → 메뉴가 닫히고 표는 안 나감 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(menu(user.page)).toBeVisible();
        await user.page.keyboard.press('Escape');
        await expect(menu(user.page)).toHaveCount(0);
        await expect(abstainBtn(user.page)).toBeEnabled();
    });

    test('투표 메뉴를 열어 둔 채 투표가 마감되면 → 메뉴가 저절로 닫힘 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(menu(user.page)).toBeVisible();
        await L.resolveVote(t);
        await expect(menu(user.page)).toHaveCount(0);
    });

    test('두 사람이 같은 봇을 찍으면 → 그 봇이 재판에 섬 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await voteTable(table, user, { humans: [user, p2], bots: 3 });
        await L.voteUi(user.page, t.bots[2].nickname);
        await L.voteUi(p2.page, t.bots[2].nickname);
        await L.botsVote(t, null);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
        await expect(tribunalDialog(p2.page)).toContainText(t.bots[2].nickname);
    });

    test('두 사람이 서로 다른 봇을 하나씩 찍으면 → 1:1 동점이라 바로 밤 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await voteTable(table, user, { humans: [user, p2], bots: 3 });
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.voteUi(p2.page, t.bots[2].nickname);
        await L.botsVote(t, null);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
        for (const page of [user.page, p2.page]) await L.closeNotice(page, '밤이 되었습니다');
    });

    test('봇이 A를 찍었다가 B로 다시 내면 → B 표로 셈 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botVote(t, t.bots[0], u(t.bots[1]));
        await L.botVote(t, t.bots[0], u(t.bots[2]));
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('봇이 찍었다가 기권(null)으로 다시 내면 → 표가 빠져 전원 기권 → 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botVote(t, t.bots[0], u(t.bots[1]));
        await L.botVote(t, t.bots[0], null);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });
});

test.describe('투표 현황 창', () => {
    test('마감 전에 투표 현황을 열면 → \'집계 전\'이 보임 @game', async ({ user, table }) => {
        await voteTable(table, user);
        const dialog = await L.readVoteStatus(user.page);
        await expect(dialog.getByTestId('vote-status-unresolved')).toHaveText('집계 전');
    });

    test('투표 현황 닫기 버튼을 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await voteTable(table, user);
        const dialog = await L.readVoteStatus(user.page);
        await dialog.getByRole('button', { name: '투표 현황 닫기' }).click();
        await expect(dialog).toBeHidden();
    });

    test('투표 현황 창에서 Esc를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        await voteTable(table, user);
        const dialog = await L.readVoteStatus(user.page);
        await user.page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('토론 중에도 투표 현황을 열면 → \'집계 전\'이 보임 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 2 });
        await L.toDay(t);
        const dialog = await L.readVoteStatus(user.page);
        await expect(dialog).toContainText('집계 전');
    });

    test('동점으로 끝나면 → 투표 현황에 결과 \'동점\'·재판 대상 \'없음\' @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'outcome')).toHaveText('동점');
        await expect(statusValue(dialog, 'tribunal-target')).toHaveText('없음');
    });

    test('전원 기권으로 끝나면 → 투표 현황에 결과 \'기권 다수\'·기권 5 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, null);
        await abstainBtn(user.page).click();
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'outcome')).toHaveText('기권 다수');
        await expect(statusValue(dialog, 'public-abstain-count')).toHaveText('5');
    });

    test('재판으로 끝난 날 밤에 투표 현황을 열면 → 결과 \'재판 회부\'·재판 대상 닉네임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, u(t.bots[2]), [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'NOT_GUILTY', [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'outcome')).toHaveText('재판 회부');
        await expect(statusValue(dialog, 'tribunal-target')).toHaveText(t.bots[2].nickname);
    });

    test('5명이 2명 찍고 3명 기권하면 → 투표 현황 득표 칸은 투표자 수 5·기권 3 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])], [t.bots[1], null], [t.bots[2], null]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'public-vote-count')).toHaveText('5');
        await expect(statusValue(dialog, 'public-abstain-count')).toHaveText('3');
    });

    test('둘째 날 낮이 되면 → 투표 현황이 다시 \'집계 전\'으로 비워짐 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(dialog).toContainText('집계 전');
    });
});

test.describe('결과', () => {
    test('봇 셋이 한 봇을 찍으면 → 그 봇이 재판에 서고 재판 창에 그 닉네임이 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, u(t.bots[3]), t.bots.slice(0, 3));
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('TRIBUNAL');
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[3]));
        await expect(tribunalDialog(user.page)).toContainText(t.bots[3].nickname);
    });

    test('한 표만 나오고 나머지가 다 기권이면 → 그 한 표 받은 사람이 재판에 섬 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botVote(t, t.bots[0], u(t.bots[2]));
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('2:2 동점이면 → 재판 없이 바로 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[1])], [t.bots[1], u(t.bots[2])]]);
        await L.voteUi(user.page, t.bots[2].nickname);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
        expect(s.tribunal).toBeNull();
    });

    test('1:1:1 세 갈래 동점이면 → 바로 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[1], u(t.bots[2])], [t.bots[2], u(t.bots[3])]]);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });

    test('동점이어도 → 다시 투표하지 않고 밤으로 감 (기권 버튼·투표 단계 다시 안 열림) @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(abstainBtn(user.page)).toHaveCount(0);
        const s = await t.state();
        expect(s.phase).toBe('NIGHT');
        expect(s.dayIndex).toBe(1);
    });

    test('모두 기권 버튼을 누르면 → 바로 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await abstainBtn(user.page).click();
        await L.botsVote(t, null);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });

    test('아무도 안 내고 마감되면 → 다 기권으로 셈해 바로 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'outcome')).toHaveText('기권 다수');
    });

    test('봇 2:1로 갈린 걸 내 표로 2:2를 만들면 → 동점이라 밤 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[1])], [t.bots[1], u(t.bots[2])]]);
        await L.voteUi(user.page, t.bots[2].nickname);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('NIGHT');
    });

    test('봇 1:1로 갈린 걸 내 표로 2:1을 만들면 → 내가 찍은 봇이 재판에 섬 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[3], u(t.bots[2])]]);
        await L.voteUi(user.page, t.bots[2].nickname);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('봇들이 나를 가장 많이 찍으면 → 내가 피고가 되어 \'당신은 피고인입니다\'가 보임 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, user.account.uuid);
        await L.resolveVote(t);
        await expect(tribunalDialog(user.page)).toContainText('당신은 피고인입니다. 투표할 수 없습니다.');
    });

    test('모두 표를 낸 뒤 \'낮 집계\'를 누르면 → 타이머를 안 기다리고 바로 재판이 열림 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, u(t.bots[1]), [t.bots[0], t.bots[2], t.bots[3]]);
        await L.botVote(t, t.bots[1], null);
        await L.voteUi(user.page, t.bots[1].nickname);
        await user.page.getByRole('button', { name: '낮 집계' }).click();
        await L.waitState(t, (s) => s.phase === 'TRIBUNAL');
        await expect(tribunalDialog(user.page)).toBeVisible();
    });

    test('아직 안 낸 사람이 있을 때 \'낮 집계\'를 누르면 → 마감되지 않고 낮 투표가 계속됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.botsVote(t, u(t.bots[1]), [t.bots[0], t.bots[2]]);
        await user.page.getByRole('button', { name: '낮 집계' }).click();
        await L.sleep(1000);
        const s = await t.state();
        expect(s.phase).toBe('DAY');
        expect(s.dayPhase).toBe('DAY_VOTE');
    });
});

test.describe('막힌 표', () => {
    test('봇이 자기 자신을 찍으면 → SELF_TARGET_NOT_ALLOWED로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const r = await L.botVote(t, t.bots[1], u(t.bots[1]));
        expect(r.code).toBe('SELF_TARGET_NOT_ALLOWED');
    });

    test('판에 없는 사람을 찍으면 → INVALID_TARGET으로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const r = await L.botVote(t, t.bots[1], '00000000-0000-4000-8000-000000000000');
        expect(r.code).toBe('INVALID_TARGET');
    });

    test('토론 중에 봇이 표를 내면 → INVALID_DAY_PHASE로 거절됨 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 3 });
        await L.toDay(t);
        const r = await L.botVote(t, t.bots[1], u(t.bots[2]));
        expect(r.code).toBe('INVALID_DAY_PHASE');
    });

    test('투표가 마감된 뒤(밤) 봇이 표를 내면 → 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await L.resolveVote(t);
        const r = await L.botVote(t, t.bots[1], u(t.bots[2]));
        expect(r.ok).toBe(false);
    });

    test('둘째 날 투표에서 죽은 사람 카드를 누르면 → \'투표하기\'가 잠기고 \'대상이 아닙니다\' 이유가 붙음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        const dead = t.bots[3];
        await toDay2Vote(t, u(dead), user.page);
        await L.card(user.page, dead.nickname).click();
        const item = menu(user.page).getByRole('menuitem', { name: '투표하기' });
        await expect(item).toBeDisabled();
        await expect(item).toHaveAttribute('title', '대상이 아닙니다');
    });

    test('둘째 날 봇이 죽은 사람을 찍으면 → TARGET_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toDay2Vote(t, u(t.bots[3]), user.page);
        const r = await L.botVote(t, t.bots[1], u(t.bots[3]));
        expect(r.code).toBe('TARGET_NOT_ALIVE');
    });

    test('둘째 날 죽은 봇이 표를 내면 → ACTOR_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toDay2Vote(t, u(t.bots[3]), user.page);
        const r = await L.botVote(t, t.bots[3], u(t.bots[1]));
        expect(r.code).toBe('ACTOR_NOT_ALIVE');
    });

    test('내가 첫날 처형되면 → 둘째 날 투표에서 카드 투표가 잠기고 \'사망한 플레이어는 행동할 수 없습니다\' 이유가 붙음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toDay2Vote(t, user.account.uuid, user.page);
        await L.card(user.page, t.bots[1].nickname).click();
        const item = menu(user.page).getByRole('menuitem', { name: '투표하기' });
        await expect(item).toBeDisabled();
        await expect(item).toHaveAttribute('title', '사망한 플레이어는 행동할 수 없습니다');
    });

    test('내가 죽은 뒤 둘째 날 투표에서는 → 기권 버튼도 잠겨 있음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toDay2Vote(t, user.account.uuid, user.page);
        await expect(abstainBtn(user.page)).toBeDisabled();
    });

    test('둘째 날 투표는 → 산 사람 표만 세어 득표 칸이 4 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await toDay2Vote(t, u(t.bots[3]), user.page);
        await L.botsVote(t, [[t.bots[0], u(t.bots[1])], [t.bots[2], u(t.bots[0])]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(statusValue(dialog, 'public-vote-count')).toHaveText('4');
    });

    test('둘째 날에도 → 기권 버튼이 다시 켜져 있음 @game', async ({ user, table }) => {
        const t = await voteTable(table, user);
        await abstainBtn(user.page).click();
        await toDay2Vote(t, u(t.bots[3]), user.page);
        await expect(abstainBtn(user.page)).toBeEnabled();
    });
});

test.describe('인원별 (5~10명)', () => {
    for (const total of [5, 6, 7, 8, 9, 10]) {
        test(`${total}명 판에서 봇 과반이 한 봇을 찍으면 → 그 봇이 재판에 섬 @game`, async ({ user, table }) => {
            const t = await voteTable(table, user, { bots: total - 1 });
            const target = t.bots[t.bots.length - 1];
            const voters = t.bots.slice(0, Math.floor(total / 2) + 1).filter((b) => b !== target);
            await L.botsVote(t, u(target), voters);
            const s = await L.resolveVote(t);
            expect(s.players).toHaveLength(total);
            expect(s.tribunal.defendantUuid).toBe(u(target));
            await expect(tribunalDialog(user.page)).toContainText(target.nickname);
        });

        test(`${total}명 판에서 두 봇이 같은 표 수로 갈리면 → 동점이라 바로 밤 @game`, async ({ user, table }) => {
            const t = await voteTable(table, user, { bots: total - 1 });
            const [a, b] = [t.bots[t.bots.length - 1], t.bots[t.bots.length - 2]];
            const voters = t.bots.filter((x) => x !== a && x !== b);
            const half = Math.floor(voters.length / 2);
            const pairs = voters.slice(0, half * 2).map((v, i) => [v, i < half ? u(a) : u(b)]);
            await L.botsVote(t, pairs);
            const s = await L.resolveVote(t);
            expect(s.phase).toBe('NIGHT');
            await L.closeNotice(user.page, '밤이 되었습니다');
        });
    }
});
