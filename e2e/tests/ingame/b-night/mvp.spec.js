// MVP 셈법 시험 파일, 결과 화면 'MVP 플레이어' 칸 이름이 셈법대로인지 (사용자 결정 2026-11-09)
// 이긴 팀만 · 시민=광대 피고에게 넣은 유죄 표 · 의사=광대가 노린 사람 살림 · 광대=죽인 수 · 경비원=광대 찾음 · 마녀사냥꾼 0 · 동점이면 산 사람 → 자리 순서
// 봇마다 날짜별 낮 투표·재판 표·밤 대상을 정해 점수를 만들고, 서버 공개 승패의 mvp와 화면 칸 이름을 같이 봄
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

/** 날짜별 값 → 봇 계획 함수 (없는 날은 fallback) */
const byDay = (map, fallback = null) => (ctx) => (map[ctx.snapshot.dayIndex] ?? fallback);

/**
 * 봇마다 계획: rows[i] = { day?: {날짜: uuid}, trial?: {날짜: 'GUILTY'|'NOT_GUILTY'}, night?: {날짜: uuid} }
 * dayAll: 모든 봇 공통 날짜별 낮 투표 (rows[i].day가 있으면 그게 먼저)
 */
function playPlan(t, rows, { dayAll = {} } = {}) {
    t.playBots((bot, i) => {
        const row = rows[i] ?? {};
        return {
            dayVote: byDay({ ...dayAll, ...(row.day ?? {}) }, null),
            tribunal: byDay(row.trial ?? {}, 'skip'),
            night: (ctx) => (row.night ?? {})[ctx.snapshot.dayIndex],
        };
    });
}

const uuid = (bot) => bot.account.uuid;

/** 끝까지 → 서버 mvp uuid 확인 → 결과 화면 MVP 칸에 그 사람 이름 */
async function expectMvp(t, page, expected) {
    const s = await n.toEnd(t);
    const win = await n.publicWinResult(t, t.bots.findIndex((b) => b.account.uuid !== expected.account.uuid));
    expect(win.mvp?.uuid).toBe(expected.account.uuid);
    await n.reachResult(page);
    await expect(n.mvpPanel(page)).toContainText(expected.account.nickname);
    return s;
}

/** 자리 순서 (판 사람 목록 순서) */
async function seatOf(t, who) {
    return (await t.state()).players.findIndex((p) => p.uuid === who.account.uuid);
}

/** 후보 중 앞자리 (동점·둘 다 생존일 때 MVP) */
async function firstSeat(t, candidates) {
    const seats = await Promise.all(candidates.map((c) => seatOf(t, c)));
    return candidates[seats.indexOf(Math.min(...seats))];
}

/** 광대 아닌 사람 중 앞자리 (모두 0점·생존일 때 MVP) */
async function firstNonJoker(t) {
    const p = (await t.state()).players.find((row) => row.role !== 'JOKER');
    return { account: { uuid: p.uuid, nickname: p.nickname } };
}

test('광대 피고에게 혼자 유죄를 넣은 시민 봇은 → 시민 승 결과 화면 MVP 칸에 그 이름이 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , c2] = t.bots;
    playPlan(t, [{}, {}, { trial: { 1: 'GUILTY' } }, {}], { dayAll: { 1: uuid(j) } });
    const s = await expectMvp(t, user.page, { account: c2.account });
    expect(s.winResult.winner).toBe('CITIZEN');
});

test('광대 피고 재판이 무죄로 끝나도 → 그때 넣은 시민 유죄 표가 점수로 남아 MVP를 가름 @game', async ({ user, table }) => {
    // 6명 자동 구성은 의사 1명이 끼어 시민이 4명뿐이라 광대1+시민5를 직접 구성으로 고정함
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, , , c4] = t.bots;
    // 첫날: c1 유죄, c2·c3 무죄 → 무죄 / 둘째 날: c4만 유죄 → 처형 → c1 1점(무죄 재판), c4 1점, 동점·둘 다 생존 → 앞자리 c1
    playPlan(t, [{}, { trial: { 1: 'GUILTY' } }, { trial: { 1: 'NOT_GUILTY' } }, { trial: { 1: 'NOT_GUILTY' } }, { trial: { 2: 'GUILTY' } }], { dayAll: { 1: uuid(j), 2: uuid(j) } });
    await expectMvp(t, user.page, await firstSeat(t, [c1, c4]));
});

test('의사·경비원이 넣은 유죄 표는 → 시민 점수로 안 쳐서 0점인 앞자리 시민이 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, d, g] = t.bots;
    playPlan(t, [{}, {}, { trial: { 1: 'GUILTY' } }, { trial: { 1: 'GUILTY' } }], { dayAll: { 1: uuid(j) } });
    await expectMvp(t, user.page, await firstNonJoker(t));
});

test('광대가 노린 사람을 살린 의사는 → 1점으로 0점 시민들을 제치고 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'DOCTOR', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , d, c2] = t.bots;
    // 첫 밤 광대가 c2를 노리고 의사가 c2를 살림, 둘째 날 의사 혼자 유죄로 광대 처형 (의사 표는 점수 아님)
    playPlan(t, [{ night: { 1: uuid(c2) } }, {}, { night: { 1: uuid(c2) }, trial: { 2: 'GUILTY' } }, {}], { dayAll: { 2: uuid(j) } });
    await expectMvp(t, user.page, d);
});

test('아무도 노리지 않은 사람을 보호한 의사는 → 0점이라 앞자리 시민이 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'DOCTOR', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, d] = t.bots;
    playPlan(t, [{}, {}, { night: { 1: uuid(c1) }, trial: { 2: 'GUILTY' } }, {}], { dayAll: { 2: uuid(j) } });
    await expectMvp(t, user.page, await firstNonJoker(t));
});

test('의사가 광대가 노린 사람을 두 밤 살리면 → 2점으로 유죄 1표 시민을 제치고 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'DOCTOR', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, d, c2] = t.bots;
    playPlan(t, [
        { night: { 1: uuid(c2), 2: uuid(c2) } },
        { trial: { 3: 'GUILTY' } },
        { night: { 1: uuid(c2), 2: uuid(c2) } },
        {},
    ], { dayAll: { 3: uuid(j) } });
    await expectMvp(t, user.page, d);
});

test('광대를 조사한 경비원은 → 1점으로 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , g] = t.bots;
    playPlan(t, [{}, {}, { night: { 1: uuid(j) }, trial: { 2: 'GUILTY' } }, {}], { dayAll: { 2: uuid(j) } });
    await expectMvp(t, user.page, g);
});

test('시민을 조사한 경비원은 → 0점이라 앞자리 시민이 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, g, c2] = t.bots;
    playPlan(t, [{}, {}, { night: { 1: uuid(c2) }, trial: { 2: 'GUILTY' } }, {}], { dayAll: { 2: uuid(j) } });
    await expectMvp(t, user.page, await firstNonJoker(t));
});

test('두 밤 광대를 찾은 경비원(2점)은 → 유죄 1표 시민(1점)을 제치고 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , g] = t.bots;
    playPlan(t, [{}, { trial: { 3: 'GUILTY' } }, { night: { 1: uuid(j), 2: uuid(j) } }, {}], { dayAll: { 3: uuid(j) } });
    await expectMvp(t, user.page, g);
});

test('죽은 사람 직업을 확인한 마녀사냥꾼은 → 0점이라 앞자리여도 유죄 1표 시민에게 MVP를 내줌 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['WITCH_HUNTER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [wh, j, c1, , c3] = t.bots;
    // 첫날 c3 처형(광대 표만 유죄) → 둘째 밤 마녀사냥꾼이 c3 확인 → 셋째 날 c1만 유죄로 광대 처형
    playPlan(t, [
        { night: { 2: uuid(c3) } },
        { trial: { 1: 'GUILTY' } },
        { trial: { 3: 'GUILTY' } },
        {},
        {},
    ], { dayAll: { 1: uuid(c3), 3: uuid(j) } });
    await expectMvp(t, user.page, c1);
    expect(n.eventsOf(wh, 'night_action_result').map((p) => p.actionType)).toEqual(['CONFIRM']);
});

test('광대 승 판에서 더 많이 죽인 광대는 → 뒷자리여도 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, c1, c2] = t.bots;
    // 첫 밤 jb 혼자 c1, 둘째 밤 둘이 c2 → jb 2점, ja 1점, 2:2로 광대 승
    playPlan(t, [{ night: { 2: uuid(c2) } }, { night: { 1: uuid(c1), 2: uuid(c2) } }, {}, {}, {}]);
    const s = await expectMvp(t, user.page, jb);
    expect(s.winResult.winner).toBe('JOKER');
});

test('광대 둘이 같은 사람을 같이 죽여 점수가 같고 둘 다 살아 있으면 → 앞자리 광대가 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, c1, c2] = t.bots;
    // 첫 밤 둘이 c1 → 각 1점, 둘째 날 c2 처형(광대 표) → 2:2 광대 승
    playPlan(t, [
        { night: { 1: uuid(c1) }, trial: { 2: 'GUILTY' } },
        { night: { 1: uuid(c1) }, trial: { 2: 'GUILTY' } },
        {}, {}, {},
    ], { dayAll: { 2: uuid(c2) } });
    await expectMvp(t, user.page, await firstSeat(t, [ja, jb]));
});

test('광대 둘의 점수가 같으면 → 처형된 앞자리 광대 대신 살아 있는 광대가 MVP @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 6, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, c1, c2, c3, c4] = t.bots;
    // 1밤 ja가 c1(ja 1) → 2낮 ja 처형 → 2밤 jb가 c2(jb 1) → 3낮 c3 처형 → 4낮 c4 처형 → 1:1 광대 승
    playPlan(t, [
        { night: { 1: uuid(c1) } },
        { night: { 2: uuid(c2) }, trial: { 3: 'GUILTY', 4: 'GUILTY' } },
        {},
        {},
        { trial: { 2: 'GUILTY' } },
        { trial: { 2: 'GUILTY', 3: 'GUILTY' } },
    ], { dayAll: { 2: uuid(ja), 3: uuid(c3), 4: uuid(c4) } });
    const s = await expectMvp(t, user.page, jb);
    expect(n.rowOf(s, ja.account.uuid).alive).toBe(false);
});

test('진 팀 시민이 유죄 점수를 가져도 → 이긴 광대(0점)가 MVP @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, c2, c3] = t.bots;
    // 1낮 c1 유죄·c2·c3 무죄로 광대 무죄(c1 1점) → 2·3·4낮 c2·c3·c1 처형 (광대 표) → 1:1 광대 승, 광대는 밤에 안 죽임
    playPlan(t, [
        { trial: { 2: 'GUILTY', 3: 'GUILTY', 4: 'GUILTY' } },
        { trial: { 1: 'GUILTY' } },
        { trial: { 1: 'NOT_GUILTY' } },
        { trial: { 1: 'NOT_GUILTY' } },
    ], { dayAll: { 1: uuid(j), 2: uuid(c2), 3: uuid(c3), 4: uuid(c1) } });
    const s = await expectMvp(t, user.page, j);
    expect(s.winResult.winner).toBe('JOKER');
});

test('점수가 더 높은 시민은 → 밤에 죽었어도 살아 있는 1점 시민을 제치고 MVP @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 6, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, c1, c2, c3, c4] = t.bots;
    // 1낮 ja 재판 c1 유죄·c3·c4 무죄 → 무죄 / 2낮 ja 재판 c1만 유죄 → 처형 (c1 2점) / 2밤 jb가 c1 죽임 / 3낮 jb 재판 c2만 유죄 → 시민 승
    playPlan(t, [
        {},
        { night: { 2: uuid(c1) } },
        { trial: { 1: 'GUILTY', 2: 'GUILTY' } },
        { trial: { 3: 'GUILTY' } },
        { trial: { 1: 'NOT_GUILTY' } },
        { trial: { 1: 'NOT_GUILTY' } },
    ], { dayAll: { 1: uuid(ja), 2: uuid(ja), 3: uuid(jb) } });
    const s = await expectMvp(t, user.page, c1);
    expect(n.rowOf(s, c1.account.uuid).alive).toBe(false);
});

test('점수가 같은 시민 둘 중 → 앞자리라도 밤에 죽은 시민 대신 살아 있는 시민이 MVP @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 6, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, c1, c2] = t.bots;
    // 1낮 ja 처형 c1만 유죄(c1 1점) / 1밤 jb가 c1 죽임 / 2낮 jb 처형 c2만 유죄(c2 1점) → 시민 승
    playPlan(t, [
        {},
        { night: { 1: uuid(c1) } },
        { trial: { 1: 'GUILTY' } },
        { trial: { 2: 'GUILTY' } },
        {}, {},
    ], { dayAll: { 1: uuid(ja), 2: uuid(jb) } });
    await expectMvp(t, user.page, c2);
});

test('광대인 내가 밤마다 화면으로 암살해 이기면 → 결과 화면 MVP 칸에 내 이름 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    await n.nightActUi(user.page, t.bots[0].nickname, '암살');
    await n.toTurn(t, 'JOKER', { dayIndex: 2 });
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    await expectMvp(t, user.page, user);
});

test('시민인 내가 진 판의 결과 화면에도 → MVP 칸이 보이고 이긴 광대 이름이 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, c2] = t.bots;
    playPlan(t, [{ night: { 1: uuid(c1), 2: uuid(c2) } }, {}, {}]);
    await expectMvp(t, user.page, j);
    await expect(user.page.getByText('패배', { exact: true })).toBeVisible();
});

test('의사 둘이 광대가 노린 사람을 같이 살리면 → 둘 다 1점이고 둘 다 살아 있어 앞자리 의사가 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'DOCTOR', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, da, db, c] = t.bots;
    playPlan(t, [{ night: { 1: uuid(c) } }, { night: { 1: uuid(c) }, trial: { 2: 'GUILTY' } }, { night: { 1: uuid(c) } }, {}], { dayAll: { 2: uuid(j) } });
    await expectMvp(t, user.page, await firstSeat(t, [da, db]));
});

test('의사인 내가 화면으로 광대가 노린 사람을 살리면 → 시민 승 결과 화면 MVP 칸에 내 이름 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , c] = t.bots;
    // 경비원 표만 유죄 (경비원 표는 점수 아님)
    playPlan(t, [{ night: { 1: uuid(c) } }, { trial: { 2: 'GUILTY' } }, {}, {}], { dayAll: { 2: uuid(j) } });
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    await n.nightActUi(user.page, c.nickname, '보호');
    await expectMvp(t, user.page, user);
});

test('경비원인 내가 화면으로 광대를 조사하면 → 시민 승 결과 화면 MVP 칸에 내 이름 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const [j] = t.bots;
    playPlan(t, [{}, { trial: { 2: 'GUILTY' } }, {}, {}], { dayAll: { 2: uuid(j) } });
    await n.toTurn(t, 'GUARD', { dayIndex: 1 });
    await n.nightActUi(user.page, j.nickname, '조사');
    await expectMvp(t, user.page, user);
});

test('광대에게 찍혀 죽은 경비원이 광대를 조사했어도 → 0점이라 살아 있는 앞자리 사람이 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, , g] = t.bots;
    playPlan(t, [{ night: { 1: uuid(g) } }, { trial: { 2: 'GUILTY' } }, { night: { 1: uuid(j) } }, {}], { dayAll: { 2: uuid(j) } });
    const s = await n.toEnd(t);
    expect(n.rowOf(s, uuid(g)).alive).toBe(false);
    const firstAliveSeat = s.players.find((p) => p.role !== 'JOKER' && p.alive);
    const win = await n.publicWinResult(t, 1);
    expect(win.mvp.uuid).toBe(firstAliveSeat.uuid);
    await n.reachResult(user.page);
    await expect(n.mvpPanel(user.page)).toContainText(firstAliveSeat.nickname);
});

test('광대 아닌 피고에게 넣은 시민 유죄 표는 → 점수가 아니라서 광대 피고에 유죄를 넣은 시민이 MVP @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, c1, c2, c3] = t.bots;
    // 1낮 c3 피고 c1만 유죄 → 처형(0점) / 2낮 광대 피고 c2만 유죄 → 시민 승 (c2 1점)
    playPlan(t, [{}, { trial: { 1: 'GUILTY' } }, { trial: { 2: 'GUILTY' } }, {}, {}], { dayAll: { 1: uuid(c3), 2: uuid(j) } });
    await expectMvp(t, user.page, c2);
    expect(c1).toBeTruthy();
});
