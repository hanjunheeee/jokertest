// 인게임 버튼 따닥·두 사람 같은 순간 누르기 시험 (재판 유죄·투표 시작 준비·낮 집계·재판 판정)
// 버튼을 빨리 두 번 누르거나 두 사람이 같이 눌러도 표·준비·판정이 한 번만 되고 오류 안내가 안 뜨는지 봄
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const u = (x) => x.account.uuid;
const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판' });
const guiltyBtn = (page) => tribunalDialog(page).getByRole('button', { name: '유죄', exact: true });
const readyBtn = (page) => page.getByRole('button', { name: '투표 시작 준비' });
const readyDone = (page) => page.getByRole('button', { name: '준비 완료' });
const dayResolveBtn = (page) => page.getByRole('button', { name: '낮 집계' });
const tribunalResolveBtn = (page) => tribunalDialog(page).getByRole('button', { name: '재판 판정' });
const expelText = (nick) => `[${nick}]님이 가면무도회에서 추방당하셨습니다.`;
const rejectText = (page) => page.getByText('요청을 처리할 수 없습니다');
const botReady = (t, bot) => bot.request('ready_for_day_vote', { gameId: t.gameId });

// 두 화면 버튼을 같은 순간 누름: 둘 다 켜진 걸 본 뒤 요소를 잡아 한꺼번에 click (먼저 눌린 쪽 때문에 다른 쪽 버튼이 사라져도 기다리지 않음)
async function clickTogether(locators) {
    for (const loc of locators) await expect(loc).toBeEnabled();
    const handles = await Promise.all(locators.map((loc) => loc.elementHandle()));
    await Promise.all(handles.map((h) => h.evaluate((el) => el.click())));
}

// 사람들(시민) + 봇 (첫 봇 광대), 낮 토론까지
async function dayTable(table, humans, { bots = 4 } = {}) {
    const roles = ({ bots: b }) => Object.fromEntries([...humans.map((h) => [u(h), 'CITIZEN']), [u(b[0]), 'JOKER']]);
    const t = await table.setup({ humans, bots, settings: { dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120 }, roles });
    await L.toDay(t);
    return t;
}

test.describe('버튼 따닥', () => {
    test('재판 유죄 버튼을 빠르게 두 번 누르면 → 표는 한 번만 셈 (봇 1:2와 합쳐 2:2 동수로 피고가 풀려남) @game', async ({ user, table }) => {
        const t = await dayTable(table, [user]);
        await L.toVote(t);
        const d = t.bots[2];
        await L.botsVote(t, u(d), t.bots.filter((b) => b !== d));
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('TRIBUNAL');

        await guiltyBtn(user.page).dblclick();
        await expect(tribunalDialog(user.page)).toContainText('투표가 완료되었습니다.');
        await expect(rejectText(user.page)).toHaveCount(0);
        // 유죄가 두 번 셌다면 3:2로 처형됨
        await L.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY'], [t.bots[1], 'NOT_GUILTY'], [t.bots[3], 'GUILTY']]);
        const after = await L.resolveTribunal(t);
        expect(L.playerOf(after, u(d)).alive).toBe(true);
    });

    test('투표 시작 준비를 빠르게 두 번 누르면 → 준비는 한 번만 셈 (봇 셋이 준비해도 토론이 계속, 넷째가 준비하면 투표) @game', async ({ user, table }) => {
        const t = await dayTable(table, [user]);
        await readyBtn(user.page).dblclick();
        await expect(readyDone(user.page)).toBeDisabled();
        await expect(rejectText(user.page)).toHaveCount(0);
        for (const bot of t.bots.slice(0, 3)) {
            const r = await botReady(t, bot);
            expect(r.ok).toBe(true);
        }
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
        await botReady(t, t.bots[3]);
        await L.waitState(t, (g) => g.dayPhase === 'DAY_VOTE');
    });
});

test.describe('두 사람 같은 순간', () => {
    test('모두 낸 뒤 두 사람이 같은 순간 낮 집계를 누르면 → 재판이 한 번 열리고 두 화면 다 재판 창, 오류 안내 없음 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await dayTable(table, [user, p2], { bots: 3 });
        await L.toVote(t);
        const d = t.bots[2];
        await L.voteUi(user.page, d.nickname);
        await L.voteUi(p2.page, d.nickname);
        await L.botsVote(t, [[t.bots[0], u(d)], [t.bots[1], u(d)], [d, u(t.bots[1])]]);

        await clickTogether([dayResolveBtn(user.page), dayResolveBtn(p2.page)]);
        const s = await L.waitState(t, (g) => g.phase === 'TRIBUNAL');
        expect(s.tribunal.defendantUuid).toBe(u(d));
        for (const page of [user.page, p2.page]) {
            await expect(tribunalDialog(page)).toBeVisible();
            await expect(tribunalDialog(page)).toContainText(d.nickname);
            await expect(rejectText(page)).toHaveCount(0);
        }
    });

    test('모두 낸 뒤 두 사람이 같은 순간 재판 판정을 누르면 → 처형 한 번, 추방 문구도 화면마다 한 번 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await dayTable(table, [user, p2], { bots: 3 });
        await L.toVote(t);
        const d = t.bots[2];
        await L.botsVote(t, u(d), t.bots.filter((b) => b !== d));
        await L.voteUi(user.page, d.nickname);
        await L.voteUi(p2.page, d.nickname);
        const s = await L.resolveVote(t);
        expect(s.phase).toBe('TRIBUNAL');

        await guiltyBtn(user.page).click();
        await guiltyBtn(p2.page).click();
        await L.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY'], [t.bots[1], 'GUILTY']]);
        for (const page of [user.page, p2.page]) await expect(tribunalDialog(page)).toContainText('투표가 완료되었습니다.');

        await clickTogether([tribunalResolveBtn(user.page), tribunalResolveBtn(p2.page)]);
        const after = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL');
        expect(after.phase).toBe('NIGHT');
        for (const page of [user.page, p2.page]) {
            await expect(page.getByText(expelText(d.nickname))).toHaveCount(1, { timeout: 25000 });
            await expect(rejectText(page)).toHaveCount(0);
        }
    });
});
