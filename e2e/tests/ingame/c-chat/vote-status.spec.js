// 투표 현황 창: 집계 전·득표/기권/결과/재판 대상, 닫기(버튼·Esc·뒤 막), 다음 날 다시 집계 전
// 봇 표로 결과를 만듦 (공개 표 수는 방 설정 voteReveal 꺼짐 기준)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const panel = (page) => page.getByRole('dialog', { name: '투표 현황' });

async function solo({ user, table, bots = 4 }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(user.page);
    return t;
}
async function openPanel(page) {
    await c.dismissOverlays(page);
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    await expect(panel(page)).toBeVisible();
}

test('낮 토론 중 투표 현황을 열면 → "집계 전"이 보임 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-unresolved')).toHaveText('집계 전');
});

test('투표 현황 닫기 버튼 → 창이 닫힘 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openPanel(user.page);
    await panel(user.page).getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(panel(user.page)).toHaveCount(0);
});

test('투표 현황에서 Esc → 창이 닫힘 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openPanel(user.page);
    await user.page.keyboard.press('Escape');
    await expect(panel(user.page)).toHaveCount(0);
});

test('봇들이 한 사람에게 몰아 투표하면 → 재판이 끝난 뒤 결과 "재판 회부"와 재판 대상 닉네임이 보임 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    const target = t.bots[1];
    await c.replan(t, (bot) => ({ dayVote: bot === target ? 'abstain' : target.account.uuid, tribunal: 'NOT_GUILTY', night: 'skip', pollMs: 200 }));
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
    await t.advanceUntil((s) => s.phase !== 'TRIBUNAL', { stepDelayMs: 900 });
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-outcome')).toHaveText('재판 회부');
    await expect(panel(user.page).getByTestId('vote-status-tribunal-target')).toHaveText(target.nickname);
});

test('모두 기권하면 → 밤에 투표 현황 결과가 "기권 다수"·재판 대상 없음 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await c.replan(t, { dayVote: 'abstain', tribunal: 'skip', night: 'skip', pollMs: 200 });
    await t.advanceUntil('NIGHT', { stepDelayMs: 900 });
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-outcome')).toHaveText('기권 다수');
    await expect(panel(user.page).getByTestId('vote-status-tribunal-target')).toHaveText('없음');
});

test('두 사람이 같은 표를 받으면 → 결과가 "동점"·재판 대상 없음 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    const [b0, b1, b2, b3] = t.bots;
    // 봇0·봇3 → 봇2, 봇1·봇2 → 봇3 ⇒ 2:2 동점
    const pick = new Map([[b0, b2], [b3, b2], [b1, b3], [b2, b3]]);
    await c.replan(t, (bot) => ({ dayVote: pick.get(bot).account.uuid, tribunal: 'skip', night: 'skip', pollMs: 200 }));
    await t.advanceUntil('NIGHT', { stepDelayMs: 900 });
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-outcome')).toHaveText('동점');
    await expect(panel(user.page).getByTestId('vote-status-tribunal-target')).toHaveText('없음');
});

test('투표 결과가 나면 → 득표 수 칸에 숫자가 보임 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    const target = t.bots[1];
    await c.replan(t, (bot) => ({ dayVote: bot === target ? 'abstain' : target.account.uuid, tribunal: 'NOT_GUILTY', night: 'skip', pollMs: 200 }));
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
    await t.advanceUntil((s) => s.phase !== 'TRIBUNAL', { stepDelayMs: 900 });
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-public-vote-count')).toHaveText(/^(\d+|-)$/);
    await expect(panel(user.page).getByTestId('vote-status-public-abstain-count')).toHaveText(/^(\d+|-)$/);
});

test('다음 날 낮이 되면 → 투표 현황이 다시 "집계 전" @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await c.replan(t, { dayVote: 'abstain', tribunal: 'skip', night: 'skip', pollMs: 200 });
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2, { stepDelayMs: 700 });
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-unresolved')).toHaveText('집계 전');
});

test('죽은 뒤에도 → 투표 현황을 열 수 있음 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await c.executeByBots(t, user.account.uuid);
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page)).toContainText('오늘 낮 투표 집계 결과입니다.');
});

test('내가 처형된 날 투표 현황 → 재판 대상에 내 닉네임 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await c.executeByBots(t, user.account.uuid);
    await c.readyToChat(user.page);
    await openPanel(user.page);
    await expect(panel(user.page).getByTestId('vote-status-tribunal-target')).toHaveText(user.account.nickname);
});
