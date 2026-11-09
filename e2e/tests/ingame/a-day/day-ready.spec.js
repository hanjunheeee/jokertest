// 낮 토론 '투표 시작 준비' 시험: 누르면 준비 완료, 산 사람이 모두 준비하면 바로 낮 투표, 죽은 사람은 안 셈, 토론 중 카드 투표는 잠김
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const readyBtn = (page) => page.getByRole('button', { name: '투표 시작 준비' });
const readyDone = (page) => page.getByRole('button', { name: '준비 완료' });
const botReady = (t, bot) => bot.request('ready_for_day_vote', { gameId: t.gameId });

async function dayTable(table, user, { bots = 4, humans = [user], settings = { dayDiscussionTime: 150 } } = {}) {
    const t = await table.setup({ humans, bots, settings, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await L.toDay(t);
    return t;
}

// 첫날 봇 하나 처형 → 밤(아무 일 없음) → 둘째 날 토론
async function toDay2WithDead(t, victimUuid, page) {
    await L.toVote(t);
    await L.botsVote(t, victimUuid, t.bots.filter((b) => b.account.uuid !== victimUuid));
    await L.resolveVote(t);
    await L.botsTribunal(t, 'GUILTY', t.bots.filter((b) => b.account.uuid !== victimUuid));
    await L.resolveTribunal(t);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
    await L.closeNotice(page, '낮이 되었습니다');
}

test.describe('준비 버튼', () => {
    test('낮 토론이 되면 → \'투표 시작 준비\' 버튼이 켜져 있음 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await expect(readyBtn(user.page)).toBeEnabled();
    });

    test('투표 시작 준비를 누르면 → 버튼이 \'준비 완료\'로 바뀌고 잠김 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await readyBtn(user.page).click();
        await expect(readyDone(user.page)).toBeDisabled();
    });

    test('키보드로 준비 버튼에 가서 Enter를 누르면 → 준비 완료가 됨 @game', async ({ user, table }) => {
        await dayTable(table, user);
        await readyBtn(user.page).focus();
        await user.page.keyboard.press('Enter');
        await expect(readyDone(user.page)).toBeVisible();
    });

    test('나만 준비하면 → 토론이 계속되고 버튼은 준비 완료 그대로 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await readyBtn(user.page).click();
        await expect(readyDone(user.page)).toBeVisible();
        await L.sleep(800);
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
    });

    test('나와 봇 셋이 준비하고 하나가 안 하면 → 아직 토론 단계 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await readyBtn(user.page).click();
        for (const bot of t.bots.slice(0, 3)) await botReady(t, bot);
        await L.sleep(800);
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
        await expect(readyDone(user.page)).toBeVisible();
    });

    test('봇이 다 준비한 뒤 내가 마지막으로 누르면 → 바로 낮 투표가 되고 기권 버튼이 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        for (const bot of t.bots) await botReady(t, bot);
        await readyBtn(user.page).click();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible();
    });

    test('내가 먼저 누르고 봇이 다 따라 누르면 → 낮 투표가 됨 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await readyBtn(user.page).click();
        await expect(readyDone(user.page)).toBeVisible();
        for (const bot of t.bots) await botReady(t, bot);
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible();
    });

    test('두 사람과 봇이 모두 준비하면 → 두 사람 화면 다 낮 투표로 바뀜 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await dayTable(table, user, { humans: [user, p2], bots: 3 });
        for (const bot of t.bots) await botReady(t, bot);
        await readyBtn(user.page).click();
        await readyBtn(p2.page).click();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        for (const page of [user.page, p2.page]) await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
    });

    test('두 사람 중 한 사람만 준비하면 → 봇이 다 준비해도 토론이 계속됨 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await dayTable(table, user, { humans: [user, p2], bots: 3 });
        for (const bot of t.bots) await botReady(t, bot);
        await readyBtn(user.page).click();
        await L.sleep(800);
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
        await expect(readyBtn(p2.page)).toBeEnabled();
    });

    test('낮 투표로 넘어가면 → 준비 버튼 대신 \'낮 집계\' 버튼이 보임 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.toVote(t);
        await expect(readyBtn(user.page)).toHaveCount(0);
        await expect(readyDone(user.page)).toHaveCount(0);
        await expect(user.page.getByRole('button', { name: '낮 집계' })).toBeVisible();
    });

    test('둘째 날 낮이 되면 → 준비 버튼이 다시 \'투표 시작 준비\'로 켜짐 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await readyBtn(user.page).click();
        for (const bot of t.bots) await botReady(t, bot);
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(readyBtn(user.page)).toBeEnabled();
    });
});

test.describe('서버 준비 수', () => {
    test('봇이 하나씩 준비하면 → 서버 답의 준비 수가 1/5, 2/5로 늘어남 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const a = await botReady(t, t.bots[0]);
        const b = await botReady(t, t.bots[1]);
        expect([a.readyCount, a.requiredCount]).toEqual([1, 5]);
        expect([b.readyCount, b.requiredCount]).toEqual([2, 5]);
    });

    test('같은 봇이 두 번 준비하면 → 두 번째도 ok이고 준비 수는 안 늘어남 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await botReady(t, t.bots[0]);
        const again = await botReady(t, t.bots[0]);
        expect(again.ok).toBe(true);
        expect(again.readyCount).toBe(1);
    });

    test('7명 판에서는 → 필요한 준비 수가 7 @game', async ({ user, table }) => {
        const t = await dayTable(table, user, { bots: 6 });
        const r = await botReady(t, t.bots[0]);
        expect(r.requiredCount).toBe(7);
    });

    test('10명 판에서는 → 필요한 준비 수가 10이고 9명만 준비하면 토론 그대로 @game', async ({ user, table }) => {
        const t = await dayTable(table, user, { bots: 9 });
        let last = null;
        for (const bot of t.bots) last = await botReady(t, bot);
        expect([last.readyCount, last.requiredCount]).toEqual([9, 10]);
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
        await readyBtn(user.page).click();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
    });

    test('역할 공개 중 봇이 준비를 보내면 → 서버가 거절함 @game', async ({ user, table }) => {
        const t = await table.setup({ humans: [user], bots: 2 });
        const r = await botReady(t, t.bots[0]);
        expect(r.ok).toBe(false);
        expect(r.code).toBe('INVALID_PHASE');
    });

    test('낮 투표 중 봇이 준비를 보내면 → INVALID_DAY_PHASE로 거절됨 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.toVote(t);
        const r = await botReady(t, t.bots[0]);
        expect(r.code).toBe('INVALID_DAY_PHASE');
    });
});

test.describe('죽은 사람과 준비', () => {
    test('첫날 처형된 봇이 있으면 → 둘째 날엔 산 사람만 준비해도 낮 투표가 됨 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        const dead = t.bots[3];
        await toDay2WithDead(t, dead.account.uuid, user.page);
        for (const bot of t.bots.slice(0, 3)) await botReady(t, bot);
        await readyBtn(user.page).click();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
    });

    test('둘째 날 필요한 준비 수는 → 산 사람 수(4)로 줄어듦 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toDay2WithDead(t, t.bots[3].account.uuid, user.page);
        const r = await botReady(t, t.bots[0]);
        expect(r.requiredCount).toBe(4);
    });

    test('처형된 봇이 둘째 날 준비를 보내면 → ACTOR_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await toDay2WithDead(t, t.bots[3].account.uuid, user.page);
        const r = await botReady(t, t.bots[3]);
        expect(r.code).toBe('ACTOR_NOT_ALIVE');
    });

    test('내가 첫날 처형되면 → 둘째 날 준비 버튼이 잠겨 있음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.toVote(t);
        await L.botsVote(t, user.account.uuid);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY');
        await L.resolveTribunal(t);
        await L.keepWatching(user.page);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await L.closeNotice(user.page, '낮이 되었습니다');
        await expect(readyBtn(user.page)).toBeDisabled();
    });
});

test.describe('토론 중 카드', () => {
    test('토론 중 다른 사람 카드를 누르면 → \'투표하기\'가 잠긴 채 보이고 토론 중이라는 이유가 붙음 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        const item = user.page.getByRole('menuitem', { name: '투표하기' });
        await expect(item).toBeDisabled();
        await expect(item).toHaveAttribute('title', '토론 중입니다. 투표는 아직 열리지 않았습니다.');
    });

    test('토론 중 열린 카드 메뉴는 → Esc로 닫힘 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
        await user.page.keyboard.press('Escape');
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toHaveCount(0);
    });

    test('토론 중 카드 메뉴를 연 채 메뉴 바깥(진행 바)을 누르면 → 메뉴가 닫힘 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
        await user.page.getByLabel('제 1일 시간 흐름').click({ position: { x: 10, y: 10 } });
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toHaveCount(0);
    });

    test('토론 중 카드 메뉴를 열어 둔 채 투표 단계가 되면 → 메뉴가 저절로 닫힘 @game', async ({ user, table }) => {
        const t = await dayTable(table, user);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toBeVisible();
        await t.advance();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        await expect(user.page.getByRole('menu', { name: '플레이어 행동' })).toHaveCount(0);
    });
});
