// 단계 전환 알림 창·진행 바·단계 줄·타이머 시험: 낮이 되었습니다/밤이 되었습니다 창, 제 N일 진행 바, [낮-토론과 투표] 줄, 방 설정 시간이 타이머에 보이는지
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const noticeDialog = (page) => page.getByRole('dialog', { name: '단계 전환 안내' });
// 안내 창이 떠 있는 동안 판 화면이 막혔는지 (inert 조상이 있는지)
const isInert = (locator) => locator.evaluate((el) => el.closest('[inert]') !== null);

// 사람 하나 + 봇 넷, 나는 시민 (밤 차례 없게)
async function citizenTable(table, user, settings = {}, bots = 4) {
    return table.setup({ humans: [user], bots, settings, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
}

test.describe('단계 전환 알림 창', () => {
    test('역할 공개가 끝나 낮이 되면 → \'낮이 되었습니다\' 창이 뜨고 진행 바가 제 1일 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.closeReveal(user.page);
        await t.advanceUntil('DAY');
        await expect(noticeDialog(user.page)).toHaveText(/낮이 되었습니다/, { timeout: 15000 });
        await expect(user.page.getByLabel('제 1일 시간 흐름')).toBeVisible();
    });

    test('낮 안내 창 확인을 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t, { closeNotices: false });
        await L.closeNotice(user.page, '낮이 되었습니다');
    });

    test('낮 안내 창 바깥 어두운 막을 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t, { closeNotices: false });
        await expect(noticeDialog(user.page)).toBeVisible({ timeout: 15000 });
        await user.page.getByRole('button', { name: '단계 전환 안내 닫기' }).click({ position: { x: 5, y: 5 } });
        await expect(noticeDialog(user.page)).toBeHidden();
    });

    test('낮 안내 창에서 Esc를 누르면 → 창이 닫힘 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t, { closeNotices: false });
        await expect(noticeDialog(user.page)).toBeVisible({ timeout: 15000 });
        await user.page.keyboard.press('Escape');
        await expect(noticeDialog(user.page)).toBeHidden();
    });

    test('낮 안내 창을 그냥 두면 → 몇 초가 지나도 저절로 안 닫힘 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user, { dayDiscussionTime: 150 });
        await L.toDay(t, { closeNotices: false });
        await expect(noticeDialog(user.page)).toBeVisible({ timeout: 15000 });
        await L.sleep(4000);
        await expect(noticeDialog(user.page)).toBeVisible();
    });

    test('낮 안내 창이 떠 있는 동안 → 판 화면(채팅 입력·카드)이 잠기고 투표 시작 준비 버튼이 꺼져 있음 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t, { closeNotices: false });
        await expect(noticeDialog(user.page)).toBeVisible({ timeout: 15000 });
        expect(await isInert(user.page.getByRole('textbox', { name: '채팅 입력' }))).toBe(true);
        expect(await isInert(L.card(user.page, t.bots[1].nickname))).toBe(true);
        await expect(user.page.getByRole('button', { name: '투표 시작 준비' })).toBeDisabled();
    });

    test('낮 안내 창을 닫으면 → 판 화면이 풀리고 투표 시작 준비 버튼이 켜짐 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        expect(await isInert(user.page.getByRole('textbox', { name: '채팅 입력' }))).toBe(false);
        await expect(user.page.getByRole('button', { name: '투표 시작 준비' })).toBeEnabled();
    });

    test('토론에서 투표로 넘어갈 때는 → 단계 전환 창이 안 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.sleep(800);
        await expect(noticeDialog(user.page)).toBeHidden();
    });

    test('투표로 재판이 열릴 때는 → 단계 전환 창 없이 재판 창이 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, t.bots[1].account.uuid, t.bots.filter((b, i) => i !== 1));
        await L.resolveVote(t);
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible();
        await expect(noticeDialog(user.page)).toBeHidden();
    });

    test('낮 투표가 동점이면 → 바로 \'밤이 되었습니다\' 창이 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        const [a, b] = [t.bots[1].account.uuid, t.bots[2].account.uuid];
        await L.botsVote(t, [[t.bots[0], a], [t.bots[3], b]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('낮 투표에서 모두 기권하면 → \'밤이 되었습니다\' 창이 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, null);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('재판에서 무죄가 나면 → \'밤이 되었습니다\' 창이 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, t.bots[2].account.uuid, [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'NOT_GUILTY', [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('재판에서 유죄가 나면 → 추방 연출이 끝난 뒤 \'밤이 되었습니다\' 창이 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        const victim = t.bots[2];
        await L.botsVote(t, victim.account.uuid, [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY', [t.bots[0], t.bots[1], t.bots[3]]);
        await L.resolveTribunal(t);
        await expect(user.page.getByText(`[${victim.nickname}]님이 가면무도회에서 추방당하셨습니다.`)).toBeVisible({ timeout: 25000 });
        await L.closeNotice(user.page, '밤이 되었습니다');
    });

    test('밤이 지나 둘째 날이 되면 → \'낮이 되었습니다\' 창이 다시 뜨고 진행 바가 제 2일 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(user.page.getByLabel('제 2일 시간 흐름')).toBeVisible();
    });

    test('두 사람이 있을 때 한 사람이 낮 안내를 닫아도 → 다른 사람 창은 그대로 있음 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await table.setup({ humans: [user, p2], bots: 3 });
        await L.toDay(t, { closeNotices: false });
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(noticeDialog(p2.page)).toBeVisible();
        await L.closeNotice(p2.page, '낮이 되었습니다');
    });

    test('낮 안내를 닫고 새로고침하면 → 같은 낮 안내 창이 다시 안 뜸 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user, { dayDiscussionTime: 150 });
        await L.toDay(t);
        await user.page.reload();
        await expect(user.page.getByLabel('제 1일 시간 흐름')).toBeVisible({ timeout: 20000 });
        await L.sleep(1500);
        await expect(noticeDialog(user.page)).toBeHidden();
    });
});

test.describe('진행 바·단계 줄', () => {
    test('낮 토론 중에는 → 단계 줄이 [낮-토론과 투표] @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await expect(user.page.getByRole('complementary', { name: '채팅' })).toContainText('[낮-토론과 투표]');
    });

    test('낮 투표 중에도 → 단계 줄이 [낮-토론과 투표] 그대로 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await expect(user.page.getByRole('complementary', { name: '채팅' })).toContainText('[낮-토론과 투표]');
    });

    test('밤이 되면 → 단계 줄이 [밤-…]으로 바뀜 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(user.page.getByRole('complementary', { name: '채팅' })).toContainText(/\[밤-/);
    });

    test('재판 중에는 → 보드 채팅 틀(단계 줄·타이머)이 숨고 재판 창만 보임 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, t.bots[1].account.uuid, [t.bots[0], t.bots[2], t.bots[3]]);
        await L.resolveVote(t);
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible();
        await expect(user.page.getByRole('complementary', { name: '채팅' })).toHaveCount(0);
        await expect(user.page.getByRole('timer')).toHaveCount(0);
    });

    test('재판이 끝나 밤이 되면 → 보드 채팅 틀이 다시 보임 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, t.bots[1].account.uuid, [t.bots[0], t.bots[2], t.bots[3]]);
        await L.resolveVote(t);
        await L.resolveTribunal(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(user.page.getByRole('complementary', { name: '채팅' })).toBeVisible();
    });

    test('밤에도 → 진행 바 날짜는 제 1일 그대로 (둘째 날 낮에 제 2일) @game', async ({ user, table }) => {
        const t = await citizenTable(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await expect(user.page.getByLabel('제 1일 시간 흐름')).toBeVisible();
    });
});

test.describe('타이머 (방 설정 시간)', () => {
    for (const sec of [30, 60, 90, 120, 150]) {
        test(`낮 토론 시간을 ${sec}초로 만든 방이면 → 토론 타이머가 ${sec}초 근처에서 시작함 @game`, async ({ user, table }) => {
            const t = await citizenTable(table, user, { dayDiscussionTime: sec });
            await L.toDay(t);
            const left = await L.timerSeconds(user.page);
            expect(left).toBeLessThanOrEqual(sec);
            expect(left).toBeGreaterThan(sec - 12);
        });
    }

    for (const sec of [30, 60, 90]) {
        test(`낮 투표 시간을 ${sec}초로 만든 방이면 → 투표로 넘어간 뒤 타이머가 ${sec}초 근처에서 다시 시작함 @game`, async ({ user, table }) => {
            const t = await citizenTable(table, user, { dayDiscussionTime: 150, dayVoteTime: sec });
            await L.toDay(t);
            await L.toVote(t);
            await expect.poll(() => L.timerSeconds(user.page)).toBeLessThanOrEqual(sec);
            const left = await L.timerSeconds(user.page);
            expect(left).toBeGreaterThan(sec - 12);
        });
    }

    test('토론 150초·투표 30초 방에서 모두 준비하면 → 타이머가 투표 시간(30초 이하)으로 바뀜 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user, { dayDiscussionTime: 150, dayVoteTime: 30 });
        await L.toDay(t);
        expect(await L.timerSeconds(user.page)).toBeGreaterThan(100);
        await user.page.getByRole('button', { name: '투표 시작 준비' }).click();
        for (const b of t.bots) await b.request('ready_for_day_vote', { gameId: t.gameId });
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await expect.poll(() => L.timerSeconds(user.page)).toBeLessThanOrEqual(30);
    });

    test('타이머는 → 시간이 지나면 숫자가 줄어듦 @game', async ({ user, table }) => {
        const t = await citizenTable(table, user, { dayDiscussionTime: 60 });
        await L.toDay(t);
        const first = await L.timerSeconds(user.page);
        await expect.poll(() => L.timerSeconds(user.page), { timeout: 8000 }).toBeLessThanOrEqual(first - 2);
    });

    test('토론 30초가 다 지나면 → 단계를 안 넘겨도 저절로 낮 투표가 됨 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await citizenTable(table, user, { dayDiscussionTime: 30 });
        await L.toDay(t);
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE', { timeout: 40000 });
        await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible();
    });

    test('투표 30초가 다 지나도록 아무도 안 내면 → 저절로 모두 기권으로 마감되어 밤이 됨 @game', async ({ user, table }) => {
        test.setTimeout(150000);
        const t = await citizenTable(table, user, { dayVoteTime: 30 });
        await L.toDay(t);
        await L.toVote(t);
        await L.waitState(t, (s) => s.phase === 'NIGHT', { timeout: 40000 });
        await L.closeNotice(user.page, '밤이 되었습니다');
    });
});
