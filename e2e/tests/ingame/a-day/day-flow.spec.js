// 낮 흐름 이어 보기 시험: 며칠에 걸친 토론→투표→재판→밤, 밤에 죽은 사람이 낮에 빠지는지, 광대 2명·직접 구성·큰 방 같은 방 설정 조합, 인원별 준비
const { test, expect } = require('../../../helpers/fixtures');
const L = require('./_lib');

const u = (x) => x.account.uuid;
const readyBtn = (page) => page.getByRole('button', { name: '투표 시작 준비' });
const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판' });
const botReady = (t, bot) => bot.request('ready_for_day_vote', { gameId: t.gameId });

async function setup(table, user, { bots = 4, humans = [user], settings = {}, roles = null } = {}) {
    return table.setup({
        humans, bots,
        settings: { dayDiscussionTime: 150, dayVoteTime: 90, ...settings },
        roles: roles ?? (({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' })),
    });
}

// 지금 낮 투표에서 대상 처형 (대상 뺀 산 봇이 찍고 유죄)
async function execute(t, victimUuid) {
    const s = await t.state();
    const alive = new Set(s.players.filter((p) => p.alive).map((p) => p.uuid));
    const voters = t.bots.filter((b) => alive.has(u(b)) && u(b) !== victimUuid);
    await L.botsVote(t, victimUuid, voters);
    const after = await L.resolveVote(t);
    if (after.phase !== 'TRIBUNAL') throw new Error(`재판이 안 열림: ${after.phase}`);
    await L.botsTribunal(t, 'GUILTY', voters);
    return L.resolveTribunal(t);
}

// 밤을 아무 일 없이 지나 다음 낮 토론까지 (사람 안내 창도 닫음)
async function nextDay(t, page) {
    const day = (await t.state()).dayIndex;
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === day + 1);
    await L.closeNotice(page, '낮이 되었습니다');
}

// 광대 봇이 밤에 대상 하나 죽이기 (광대 차례가 올 때까지 넘기고 행동)
async function jokerKills(t, jokerBot, victimUuid) {
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER');
    const r = await jokerBot.request('submit_night_action', { gameId: t.gameId, targetId: victimUuid });
    if (!r?.ok) throw new Error(`광대 밤 행동 실패: ${r?.code}`);
}

test.describe('며칠 이어서', () => {
    test('첫날 동점 → 밤 → 둘째 날 처형 → 밤 → 셋째 날이 되면 → 진행 바가 제 3일 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        await L.toVote(t);
        await execute(t, u(t.bots[3]));
        await nextDay(t, user.page);
        await expect(user.page.getByLabel('제 3일 시간 흐름')).toBeVisible();
        expect((await t.state()).dayIndex).toBe(3);
    });

    test('둘째 날 낮 토론 타이머는 → 방 설정 토론 시간(150초)으로 다시 시작함 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        expect(await L.timerSeconds(user.page)).toBeGreaterThan(130);
    });

    test('동점으로 밤을 넘기고 아무도 안 죽였으면 → 둘째 날에도 5명이 다 살아 있음 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        expect((await t.state()).players.filter((p) => p.alive)).toHaveLength(5);
    });

    test('이틀 동안 한 명씩 처형하면 → 셋째 날 낮 투표 득표 칸이 산 사람 수 4 (6명 중 2명 처형) @game', async ({ user, table }) => {
        const t = await setup(table, user, { bots: 5, settings: { jokerCount: 1 } });
        await L.toDay(t);
        await L.toVote(t);
        await execute(t, u(t.bots[4]));
        await nextDay(t, user.page);
        await L.toVote(t);
        await execute(t, u(t.bots[3]));
        await nextDay(t, user.page);
        await L.toVote(t);
        await L.botsVote(t, null, [t.bots[0], t.bots[1], t.bots[2]]);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        const dialog = await L.readVoteStatus(user.page);
        await expect(dialog.getByTestId('vote-status-public-vote-count')).toHaveText('4');
    });

    test('둘째 날 낮에도 → 다른 사람 카드의 투표하기는 토론 중이라 잠겨 있음 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        await L.card(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
    });

    test('둘째 날 낮 봇 채팅도 → 사람 화면에 보임 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        await L.botChat(t, t.bots[2], '둘째 날 인사');
        await expect(L.chatLog(user.page)).toContainText('둘째 날 인사');
    });

    test('둘째 날 모두 준비하면 → 다시 낮 투표가 열림 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        for (const bot of t.bots) await botReady(t, bot);
        await readyBtn(user.page).click();
        await L.waitState(t, (s) => s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
        await expect(user.page.getByRole('button', { name: '기권' })).toBeEnabled();
    });

    test('둘째 날 내가 피고가 되어 무죄를 받으면 → 셋째 날에도 살아 있음 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await nextDay(t, user.page);
        await L.toVote(t);
        await L.botsVote(t, user.account.uuid);
        await L.resolveVote(t);
        await expect(tribunalDialog(user.page)).toContainText('당신은 피고인입니다');
        await L.botsTribunal(t, 'NOT_GUILTY');
        await L.resolveTribunal(t);
        await nextDay(t, user.page);
        expect(L.playerOf(await t.state(), user.account.uuid).alive).toBe(true);
    });

    test('밤과 낮을 두 번 오가면 → 낮·밤 안내 창이 날마다 한 번씩 뜸 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        for (let day = 1; day <= 2; day += 1) {
            await L.toVote(t);
            await L.resolveVote(t);
            await L.closeNotice(user.page, '밤이 되었습니다');
            await nextDay(t, user.page);
        }
        expect((await t.state()).dayIndex).toBe(3);
    });
});

test.describe('밤에 죽은 사람', () => {
    test('광대 봇이 밤에 봇 하나를 죽이면 → 둘째 날 그 봇 카드에 \'사망\'이 붙음 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        const victim = t.bots[3];
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await L.closeNotice(user.page, '밤이 되었습니다');
        await jokerKills(t, t.bots[0], u(victim));
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await expect.poll(async () => L.playerOf(await t.state(), u(victim)).alive).toBe(false);
        await expect(L.card(user.page, victim.nickname)).toContainText('사망', { timeout: 30000 });
    });

    test('밤에 죽은 봇은 → 둘째 날 준비 수에서 빠짐 (필요 4) @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await jokerKills(t, t.bots[0], u(t.bots[3]));
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        const r = await botReady(t, t.bots[1]);
        expect(r.requiredCount).toBe(4);
    });

    test('밤에 죽은 봇에게는 → 둘째 날 투표를 할 수 없음 (TARGET_NOT_ALIVE) @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await jokerKills(t, t.bots[0], u(t.bots[3]));
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await t.advance();
        await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
        expect((await L.botVote(t, t.bots[1], u(t.bots[3]))).code).toBe('TARGET_NOT_ALIVE');
    });

    test('밤에 내가 죽으면 → 둘째 날 투표 시작 준비 버튼이 잠김 @game', async ({ user, table }) => {
        const t = await setup(table, user);
        await L.toDay(t);
        await L.toVote(t);
        await L.resolveVote(t);
        await jokerKills(t, t.bots[0], user.account.uuid);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        await expect.poll(async () => L.playerOf(await t.state(), user.account.uuid).alive).toBe(false);
        await expect(readyBtn(user.page)).toBeDisabled({ timeout: 30000 });
    });
});

test.describe('방 설정 조합', () => {
    test('광대 2명 6인 판에서 광대 하나를 처형하면 → 판이 끝나지 않고 밤으로 감 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await setup(table, user, { bots: 5, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [me]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', [b[1].account.uuid]: 'JOKER' }) });
        await L.toDay(t);
        await L.toVote(t);
        const s = await execute(t, u(t.bots[1]));
        expect(s.phase).toBe('NIGHT');
    });

    test('광대 2명 6인 판에서 이틀에 걸쳐 광대 둘을 처형하면 → 시민 승리로 끝남 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await setup(table, user, { bots: 5, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [me]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', [b[1].account.uuid]: 'JOKER' }) });
        await L.toDay(t);
        await L.toVote(t);
        await execute(t, u(t.bots[1]));
        await nextDay(t, user.page);
        await L.toVote(t);
        const voters = t.bots.slice(2);
        await L.botsVote(t, u(t.bots[0]), voters);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY', voters);
        await t.advance();
        await expect.poll(async () => { const s = await t.state(); return s ? `${s.phase}:${s.winResult?.winner}` : 'GONE'; }).toMatch(/ENDED:CITIZEN|GONE/);
    });

    test('광대 2명 5인 판에서 시민 하나를 처형하면 → 광대 2 : 시민 2가 되어 광대 승리로 끝남 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        const t = await setup(table, user, { bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [me]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', [b[1].account.uuid]: 'JOKER' }) });
        await L.toDay(t);
        await L.toVote(t);
        const voters = t.bots.filter((b) => b !== t.bots[3]);
        await L.botsVote(t, u(t.bots[3]), voters);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY', voters);
        await t.advance();
        await expect.poll(async () => { const s = await t.state(); return s ? `${s.phase}:${s.winResult?.winner}` : 'GONE'; }).toMatch(/ENDED:JOKER|GONE/);
    });

    test('직접 구성(광대·의사·경비원) 5인 판에서 의사를 처형하면 → 의사가 죽고 판은 밤으로 이어짐 @game', async ({ user, table }) => {
        const me = user.account.uuid;
        // 역할 미리 정하기는 나·광대만 (여러 명을 정하면 서로 바꿔 끼우다 못 맞출 수 있음), 의사 봇은 판 요약에서 찾음
        const t = await setup(table, user, { settings: L.customRoles({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), roles: ({ bots: b }) => ({ [me]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        const doctorUuid = (await t.state()).players.find((p) => p.role === 'DOCTOR').uuid;
        await L.toDay(t);
        await L.toVote(t);
        const s = await execute(t, doctorUuid);
        const doc = L.playerOf(s, doctorUuid);
        expect(doc.role).toBe('DOCTOR');
        expect(doc.alive).toBe(false);
        expect(s.phase).toBe('NIGHT');
    });

    test('내가 광대여도 → 낮 투표 카드 메뉴로 표를 낼 수 있음 @game', async ({ user, table }) => {
        const t = await setup(table, user, { roles: { [user.account.uuid]: 'JOKER' } });
        await L.toDay(t);
        await L.toVote(t);
        await L.voteUi(user.page, t.bots[1].nickname);
        await L.botsVote(t, null);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[1]));
    });

    test('하나뿐인 광대인 내가 처형되면 → 시민 승리로 끝나고 결과 화면으로 감 @game', async ({ user, table }) => {
        const t = await setup(table, user, { roles: { [user.account.uuid]: 'JOKER' } });
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, user.account.uuid);
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY');
        await t.advance();
        await expect(user.page).toHaveURL(/result/i, { timeout: 40000 });
    });

    test('정원 10명 방에 5명만 들어와 시작하면 → 준비·투표는 들어온 5명 기준 @game', async ({ user, table }) => {
        const t = await setup(table, user, { settings: { maxPlayers: 10 } });
        await L.toDay(t);
        const r = await botReady(t, t.bots[0]);
        expect(r.requiredCount).toBe(5);
        await L.toVote(t);
        await L.botsVote(t, u(t.bots[2]), [t.bots[0], t.bots[1]]);
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(t.bots[2]));
    });

    test('토론 60초·투표 30초·재판 15초 방이면 → 토론 타이머 60 근처, 투표로 넘기면 30 이하 @game', async ({ user, table }) => {
        const t = await setup(table, user, { settings: { dayDiscussionTime: 60, dayVoteTime: 30, tribunalTime: 15 } });
        await L.toDay(t);
        expect(await L.timerSeconds(user.page)).toBeGreaterThan(48);
        await L.toVote(t);
        await expect.poll(() => L.timerSeconds(user.page)).toBeLessThanOrEqual(30);
    });

    test('토론 90초·투표 60초 방이면 → 토론 타이머는 60초보다 크고 투표 타이머는 60 이하 @game', async ({ user, table }) => {
        const t = await setup(table, user, { settings: { dayDiscussionTime: 90, dayVoteTime: 60 } });
        await L.toDay(t);
        expect(await L.timerSeconds(user.page)).toBeGreaterThan(70);
        await L.toVote(t);
        await expect.poll(() => L.timerSeconds(user.page)).toBeLessThanOrEqual(60);
        expect(await L.timerSeconds(user.page)).toBeGreaterThan(45);
    });

    test('두 사람과 봇 여덟인 10명 판에서 → 두 사람이 같은 봇을 찍고 봇 넷이 따르면 그 봇이 재판에 섬 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await setup(table, user, { humans: [user, p2], bots: 8 });
        await L.toDay(t);
        await L.toVote(t);
        const target = t.bots[7];
        await L.voteUi(user.page, target.nickname);
        await L.voteUi(p2.page, target.nickname);
        await L.botsVote(t, u(target), t.bots.slice(0, 4));
        const s = await L.resolveVote(t);
        expect(s.tribunal.defendantUuid).toBe(u(target));
        for (const page of [user.page, p2.page]) await expect(tribunalDialog(page)).toContainText(target.nickname);
    });

    test('두 사람 중 하나가 첫날 처형되면 → 둘째 날 산 사람 준비 수는 4 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await setup(table, user, { humans: [user, p2], bots: 3 });
        await L.toDay(t);
        await L.toVote(t);
        await L.botsVote(t, u(p2));
        await L.resolveVote(t);
        await L.botsTribunal(t, 'GUILTY');
        await guiltyIfVisible(user.page);
        await L.resolveTribunal(t);
        await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
        const r = await botReady(t, t.bots[0]);
        expect(r.requiredCount).toBe(4);
        await expect(readyBtn(p2.page)).toBeDisabled({ timeout: 30000 });
    });
});

// 재판 창에 유죄 버튼이 보이면 누름 (사람 표까지 채우려고)
async function guiltyIfVisible(page) {
    const btn = page.getByRole('dialog', { name: '재판' }).getByRole('button', { name: '유죄', exact: true });
    if (await btn.isVisible().catch(() => false)) await btn.click();
}

test.describe('인원별 준비 (5~10명)', () => {
    for (const total of [5, 6, 7, 8, 9, 10]) {
        test(`${total}명 판에서 봇이 다 준비하고 내가 마지막으로 누르면 → 낮 투표가 됨 (필요 ${total}) @game`, async ({ user, table }) => {
            const t = await setup(table, user, { bots: total - 1 });
            await L.toDay(t);
            let last = null;
            for (const bot of t.bots) last = await botReady(t, bot);
            expect([last.readyCount, last.requiredCount]).toEqual([total - 1, total]);
            await readyBtn(user.page).click();
            await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
            await expect(user.page.getByRole('button', { name: '기권' })).toBeVisible();
        });
    }
});

test.describe('인원별 한 바퀴 (5~10명)', () => {
    for (const total of [5, 7, 10]) {
        test(`${total}명 판에서 준비→투표→재판→처형→밤→둘째 날까지 돌면 → 둘째 날 산 사람이 ${total - 1}명 @game`, async ({ user, table }) => {
            const t = await setup(table, user, { bots: total - 1 });
            await L.toDay(t);
            for (const bot of t.bots) await botReady(t, bot);
            await readyBtn(user.page).click();
            await L.waitState(t, (s) => s.dayPhase === 'DAY_VOTE');
            await execute(t, u(t.bots[t.bots.length - 1]));
            await nextDay(t, user.page);
            expect((await t.state()).players.filter((p) => p.alive)).toHaveLength(total - 1);
        });
    }
});
