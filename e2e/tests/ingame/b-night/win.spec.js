// 승패 시험 파일, 광대 수 ≥ 시민 쪽 수 → 광대 승 / 광대 전멸 → 시민 승, 인원(2~10명)·광대 수·직접 구성별, 마지막 처형으로 끝남·밤에 끝남, 결과 화면으로 이동
// 봇이 낮엔 정해 둔 순서로 처형, 밤엔 광대 봇이 정해 둔 순서로 죽임 (사람은 시민으로 끝까지 살아서 결과 화면을 봄)
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

/** 목록에서 첫 산 사람 uuid (없으면 null = 기권) */
const firstAlive = (uuids) => (ctx) => uuids.find((u) => ctx.players.find((p) => p.uuid === u)?.isAlive) ?? null;

/** 판이 무엇으로 끝났는지: 'NIGHT'(밤 결과) | 'TRIBUNAL'(재판 처형) | null */
function endedBy(bot) {
    const hit = bot.events.filter((r) => (r.event === 'night_result_applied' || r.event === 'tribunal_vote_resolved') && r.payload?.winResult);
    if (hit.length === 0) return null;
    return hit[0].event === 'night_result_applied' ? 'NIGHT' : 'TRIBUNAL';
}

/**
 * 광대 승 계획: 낮엔 시민 봇 처형, 밤엔 광대 봇이 시민 봇 죽임 (사람은 안 건드림)
 * @param {*} t 판
 * @param {number} jokers 앞에서 몇 봇이 광대인지
 * @param {{day?:boolean, night?:boolean}} o 낮 처형·밤 죽임을 쓸지
 */
function playJokerWin(t, jokers, { day = true, night = true } = {}) {
    const victims = t.bots.slice(jokers).map((b) => b.account.uuid);
    t.playBots((bot, i) => ({
        dayVote: day ? firstAlive(victims) : 'abstain',
        tribunal: 'GUILTY',
        night: i < jokers && night ? firstAlive(victims) : 'skip',
    }));
}

/** 시민 승 계획: 낮마다 광대 봇을 하나씩 처형, 밤엔 아무도 안 죽임 */
function playCitizenWin(t, jokers) {
    const targets = t.bots.slice(0, jokers).map((b) => b.account.uuid);
    t.playBots({ dayVote: firstAlive(targets), tribunal: 'GUILTY', night: 'skip' });
}

/** 결과 화면에서 이긴 진영 글·승패 띠 확인 */
async function expectResultScreen(page, { team, outcome }) {
    await n.reachResult(page);
    await expect(page.getByText(team === 'JOKER' ? '광대 진영 승리' : '시민 진영 승리', { exact: true })).toBeVisible();
    await expect(page.getByText(outcome, { exact: true })).toBeVisible();
}

// 자동 구성 인원 × 광대 수
const MATRIX = [];
for (let players = 5; players <= 10; players += 1) for (const jokers of [1, 2]) MATRIX.push({ players, jokers });

for (const c of MATRIX) {
    test(`${c.players}인·광대 ${c.jokers}명 판에서 광대를 모두 처형하면 → 시민 승, 시민인 내 결과 화면에 "시민 진영 승리"와 승리 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: { jokerCount: c.jokers }, humanRoles: ['CITIZEN'], botRoles: Array(c.jokers).fill('JOKER') });
        await ui.readRoleReveal(user.page);
        playCitizenWin(t, c.jokers);
        const s = await n.toEnd(t);
        expect(s.winResult.winner).toBe('CITIZEN');
        expect(s.players.filter((p) => p.role === 'JOKER' && p.alive)).toHaveLength(0);
        expect(s.dayIndex).toBe(c.jokers);
        expect(endedBy(t.bots[c.jokers])).toBe('TRIBUNAL');
        await expectResultScreen(user.page, { team: 'CITIZEN', outcome: '승리' });
    });

    test(`${c.players}인·광대 ${c.jokers}명 판에서 광대가 낮 처형·밤 암살로 시민 쪽 수를 따라잡으면 → 광대 승, 시민인 내 결과 화면에 "광대 진영 승리"와 패배 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: { jokerCount: c.jokers }, humanRoles: ['CITIZEN'], botRoles: Array(c.jokers).fill('JOKER') });
        await ui.readRoleReveal(user.page);
        playJokerWin(t, c.jokers);
        const s = await n.toEnd(t);
        expect(s.winResult.winner).toBe('JOKER');
        const jokersAlive = s.players.filter((p) => p.role === 'JOKER' && p.alive).length;
        const othersAlive = s.players.filter((p) => p.role !== 'JOKER' && p.alive).length;
        expect(jokersAlive).toBe(c.jokers);
        // 딱 따라잡는 순간 끝남 (한 명씩 줄어서 같은 수에서 멈춤)
        expect(othersAlive).toBe(jokersAlive);
        expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
        await expectResultScreen(user.page, { team: 'JOKER', outcome: '패배' });
    });
}

// 직접 구성
const CUSTOM = [
    { name: '네 직업 다 있는 6인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, players: 6 },
    { name: '의사 2·경비원 2·광대 2인 8인', counts: { JOKER: 2, DOCTOR: 2, GUARD: 2 }, players: 8 },
    { name: '의사 2명·광대 1명 5인', counts: { JOKER: 1, DOCTOR: 2 }, players: 5 },
    { name: '광대 2·경비원·마녀사냥꾼 7인', counts: { JOKER: 2, GUARD: 1, WITCH_HUNTER: 1 }, players: 7 },
    { name: '시민 없이 직업만 있는 6인(광대2·의사2·경비원2)', counts: { JOKER: 2, DOCTOR: 2, GUARD: 2 }, players: 6 },
    { name: '마녀사냥꾼 2명 9인', counts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 2 }, players: 9 },
    { name: '광대·의사·경비원 4인', counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, players: 4 },
    { name: '직업 최대(광대2·의사2·경비원2·마녀사냥꾼2) 10인', counts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, players: 10 },
    { name: '광대 1명만 있는 3인', counts: { JOKER: 1 }, players: 3 },
];

for (const c of CUSTOM) {
    test(`직접 구성 ${c.name} 판에서 광대를 다 처형하면 → 시민 승 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const humanRole = c.counts.JOKER + (c.counts.DOCTOR ?? 0) + (c.counts.GUARD ?? 0) + (c.counts.WITCH_HUNTER ?? 0) >= c.players ? 'DOCTOR' : 'CITIZEN';
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: n.custom(c.counts), humanRoles: [humanRole], botRoles: Array(c.counts.JOKER).fill('JOKER') });
        await ui.readRoleReveal(user.page);
        const s0 = await t.state();
        for (const [role, count] of Object.entries(c.counts)) expect(s0.players.filter((p) => p.role === role)).toHaveLength(count);
        playCitizenWin(t, c.counts.JOKER);
        const s = await n.toEnd(t);
        expect(s.winResult.winner).toBe('CITIZEN');
        await expectResultScreen(user.page, { team: 'CITIZEN', outcome: '승리' });
    });

    test(`직접 구성 ${c.name} 판에서 광대가 수를 따라잡으면 → 광대 승 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const humanRole = c.counts.JOKER + (c.counts.DOCTOR ?? 0) + (c.counts.GUARD ?? 0) + (c.counts.WITCH_HUNTER ?? 0) >= c.players ? 'DOCTOR' : 'CITIZEN';
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: n.custom(c.counts), humanRoles: [humanRole], botRoles: Array(c.counts.JOKER).fill('JOKER') });
        await ui.readRoleReveal(user.page);
        playJokerWin(t, c.counts.JOKER);
        const s = await n.toEnd(t);
        expect(s.winResult.winner).toBe('JOKER');
        await expectResultScreen(user.page, { team: 'JOKER', outcome: '패배' });
    });
}

// 끝나는 때
test('광대 1·시민 3 판에서 밤 암살만으로 따라잡으면 → 마지막 밤 결과로 판이 끝남(밤에 끝남) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    playJokerWin(t, 1, { day: false });
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    expect(endedBy(t.bots[1])).toBe('NIGHT');
    const last = n.eventsOf(t.bots[1], 'night_result_applied').at(-1);
    expect(last.phase).toBe('ENDED');
    expect(last.winResult.winner).toBe('JOKER');
});

test('광대 1·시민 3 판에서 낮 처형만으로 따라잡으면 → 마지막 처형으로 판이 끝남(재판에서 끝남) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    playJokerWin(t, 1, { night: false });
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    expect(endedBy(t.bots[1])).toBe('TRIBUNAL');
    expect(s.dayIndex).toBe(2);
});

test('광대 하나를 처형하는 순간 → 바로 시민 승으로 끝나고 그날 밤으로 안 넘어감 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    playCitizenWin(t, 1);
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('CITIZEN');
    expect(n.eventsOf(t.bots[1], 'night_turn_started')).toEqual([]);
    expect(endedBy(t.bots[1])).toBe('TRIBUNAL');
});

test('2인 판(광대 봇·시민인 나)에서 광대가 밤에 나를 죽이면 → 광대 승, 죽은 나도 결과 화면으로 가서 패배 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 1, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: me });
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    expect(n.rowOf(s, me).alive).toBe(false);
    await expectResultScreen(user.page, { team: 'JOKER', outcome: '패배' });
});

test('3인 판(광대 1·시민 2)에서 한 명만 죽으면 → 1:1이 되어 광대 승 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 2, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? t.bots[1].account.uuid : 'skip' }));
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    expect(s.dayIndex).toBe(1);
});

test('광대 1·시민 3 판에서 한 명 죽어 1:2가 되면 → 아직 안 끝나고 둘째 날이 옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? t.bots[1].account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(s.winResult).toBeNull();
    expect(n.aliveCount(s)).toBe(3);
});

test('광대 2·나머지 4 판에서 광대 하나를 처형해 1:4가 되면 → 판이 계속되고 남은 광대 차례가 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: { jokerCount: 2 }, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: firstAlive([t.bots[0].account.uuid]), tribunal: 'GUILTY', night: 'skip' });
    const s = await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect(s.winResult).toBeNull();
    expect(n.rowOf(s, t.bots[0].account.uuid).alive).toBe(false);
});

test('광대 2·나머지 3 판에서 밤에 하나 죽어 2:2가 되면 → 그 밤 결과로 광대 승 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    playJokerWin(t, 2, { day: false });
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    expect(s.dayIndex).toBe(1);
    expect(endedBy(t.bots[2])).toBe('NIGHT');
});

test('광대가 끝까지 처형도 암살도 안 되면 → 판이 계속 이어짐 (5일째까지 승패 없음) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const s = await n.toDay(t, { dayIndex: 5 });
    expect(s.winResult).toBeNull();
    expect(n.aliveCount(s)).toBe(4);
    await expect(user.page.getByText('제 5일')).toBeVisible();
});

// 결과 화면
test('사람 둘(광대·시민)인 판이 광대 승으로 끝나면 → 광대인 사람은 승리, 시민인 사람은 패배 화면 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 2, humanRoles: ['JOKER', 'CITIZEN'], botRoles: ['CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    // 첫날 낮에 봇 하나 처형 → 그 밤 광대인 내가 남은 봇 암살 → 1:1
    t.playBots({ dayVote: firstAlive([t.bots[0].account.uuid]), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    await expectResultScreen(user.page, { team: 'JOKER', outcome: '승리' });
    await expectResultScreen(p2.page, { team: 'JOKER', outcome: '패배' });
});

test('광대인 내가 밤마다 화면으로 암살해 이기면 → 내 결과 화면에 "광대 진영 승리"와 승리 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    await n.nightActUi(user.page, t.bots[0].nickname, '암살');
    await n.toTurn(t, 'JOKER', { dayIndex: 2 });
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('JOKER');
    await expectResultScreen(user.page, { team: 'JOKER', outcome: '승리' });
});

test('판이 끝난 결과 화면엔 → 모든 참가자 이름과 직업 이름(광대·귀족·주치의·경비원)이 공개됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    playCitizenWin(t, 1);
    await n.toEnd(t);
    await n.reachResult(user.page);
    const labels = { JOKER: '광대', CITIZEN: '귀족', DOCTOR: '주치의', GUARD: '경비원' };
    const rows = user.page.getByRole('listitem');
    for (const p of (await t.state()).players) {
        await expect(rows.filter({ hasText: p.nickname })).toContainText(labels[p.role]);
    }
    await expect(rows.filter({ hasText: user.account.nickname })).toContainText('내 정보');
});

test('판이 끝난 결과 화면엔 → 대기방으로·로비로 버튼이 보임 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 2, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    playCitizenWin(t, 1);
    await n.toEnd(t);
    await n.reachResult(user.page);
    await expect(user.page.getByRole('button', { name: '대기방으로' })).toBeVisible();
    await expect(user.page.getByRole('button', { name: '로비로' })).toBeVisible();
});

test('판이 끝나면 → 공개 승패에 모든 사람 역할·팀·생존·죽은 이유(처형 EXECUTION·암살 ASSASSINATION)가 실림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const [joker, killed] = [t.bots[0], t.bots[1]];
    t.playBots((bot, i) => ({
        dayVote: (ctx) => (ctx.snapshot.dayIndex >= 2 ? joker.account.uuid : null),
        tribunal: 'GUILTY',
        night: i === 0 ? killed.account.uuid : 'skip',
    }));
    const s = await n.toEnd(t);
    expect(s.winResult.winner).toBe('CITIZEN');
    const win = await n.publicWinResult(t, 2);
    const byUuid = Object.fromEntries(win.reveals.map((r) => [r.uuid, r]));
    expect(byUuid[joker.account.uuid]).toMatchObject({ role: 'JOKER', team: 'JOKER', alive: false, deathReason: 'EXECUTION' });
    expect(byUuid[killed.account.uuid]).toMatchObject({ team: 'CITIZEN', alive: false, deathReason: 'ASSASSINATION' });
    expect(byUuid[user.account.uuid]).toMatchObject({ role: 'CITIZEN', alive: true, deathReason: null });
});

test('판이 끝난 뒤 광대 봇이 밤 행동을 보내면 → 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 2, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    playCitizenWin(t, 1);
    await n.toEnd(t);
    const reply = await n.botNight(t, t.bots[1], user.account.uuid);
    expect(reply.ok).toBe(false);
});

// 밤 암살만으로 광대 승 (인원별로 밤 수가 다름: 시민 쪽 수 - 광대 수 만큼)
const NIGHT_ONLY = [
    { players: 5, jokers: 1 }, { players: 6, jokers: 1 }, { players: 7, jokers: 1 }, { players: 8, jokers: 1 },
    { players: 6, jokers: 2 }, { players: 7, jokers: 2 }, { players: 8, jokers: 2 }, { players: 10, jokers: 2 },
];

for (const c of NIGHT_ONLY) {
    const nights = c.players - 2 * c.jokers;
    test(`${c.players}인·광대 ${c.jokers}명 판에서 낮엔 아무도 처형 안 되고 광대가 밤마다 하나씩 죽이면 → ${nights}번째 밤 결과로 광대 승 @game`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const t = await n.setup(table, { humans: [user], bots: c.players - 1, settings: { jokerCount: c.jokers }, humanRoles: ['CITIZEN'], botRoles: Array(c.jokers).fill('JOKER') });
        await ui.readRoleReveal(user.page);
        playJokerWin(t, c.jokers, { day: false });
        const s = await n.toEnd(t, { maxSteps: 200 });
        expect(s.winResult.winner).toBe('JOKER');
        expect(s.dayIndex).toBe(nights);
        expect(endedBy(t.bots[c.jokers])).toBe('NIGHT');
        expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
    });
}
