'use strict';

// 재판 표 동시에 누르기 어려운 시험: 마지막 표를 여럿이 같은 순간 눌러도 마감 당김·판정은 한 번, 두 사람이 유죄·무죄로 갈려도 낸 대로 판정
// 목록 A04-H-008·009·034 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');

const { trial } = A;


// 봇이 그 시각 뒤에 받은 그 사건 수 (서버가 판 전원에게 보낸 알림을 봇도 똑같이 받음)
const received = (bot, event, since) => bot.events.filter((e) => e.event === event && e.at >= since).length;

test('A04-H-008 마지막 표를 사람 넷이 같은 순간 눌러도 마감 당김 1번·판정 1번 (사람 4 + 봇 2 = 6명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user];
    for (let i = 0; i < 3; i += 1) people.push(await players.add());
    const { t, d } = await A.startTrial(table, { humans: people, bots: 2 });
    const bot = t.bots[0];
    await A.botsTribunal(t, 'GUILTY', [bot]);
    for (const p of people) await expect(trial.button(p.page, 'GUILTY')).toBeEnabled();
    const since = Date.now();
    await Promise.all(people.map((p) => trial.button(p.page, 'GUILTY').click()));
    for (const p of people) await expect(trial.done(p.page)).toBeVisible();
    // 다 찼으니 서버가 5초 뒤 스스로 판정 → 판정 알림 다음에 오는 밤 차례 알림까지 받고 셈
    await bot.waitForEvent('tribunal_vote_resolved', { since, timeoutMs: 10000 });
    await bot.waitForEvent('night_turn_started', { since, timeoutMs: 10000 });
    expect(received(bot, 'phase_settle_started', since)).toBe(1);
    expect(received(bot, 'tribunal_vote_resolved', since)).toBe(1);
    // 유죄 5표 → 처형도 한 번
    expect((await t.player(A.uuidOf(d))).alive).toBe(false);
});

test('A04-H-009 마지막 두 사람이 동시에 눌러도 둘 다 "[5초 뒤 마감]"을 보고 판정은 1번 (사람 2 + 봇 5 = 7명) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add()];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 5 });
    const bot = t.bots[0];
    await A.botsTribunal(t, 'GUILTY', await A.votersOf(t, d));
    for (const p of people) await expect(trial.button(p.page, 'GUILTY')).toBeEnabled();
    const since = Date.now();
    await Promise.all(people.map((p) => trial.button(p.page, 'GUILTY').click()));
    await Promise.all(people.map((p) => A.expectSettleShown(p.page, { light: true })));
    // 손잡이 없이 5초를 기다림: 당김 알림을 받은 때부터 5초(±1.5초) 뒤 두 화면이 닫힘
    const closed = await Promise.all(people.map((p) => A.closedAt(p.page, { timeout: 10000 })));
    const pulled = bot.events.findLast((e) => e.event === 'phase_settle_started' && e.at >= since);
    expect(pulled, '마감 당김 알림').toBeTruthy();
    A.expectNear(pulled.payload.deadline - pulled.at, 5000, '다 찬 뒤 판정까지');
    for (const at of closed) A.expectNear(at, pulled.payload.deadline, '당겨진 마감에 재판 창이 닫힘');
    await bot.waitForEvent('night_turn_started', { since, timeoutMs: 10000 });
    expect(received(bot, 'phase_settle_started', since)).toBe(1);
    expect(received(bot, 'tribunal_vote_resolved', since)).toBe(1);
});

test('A04-H-034 두 사람이 유죄·무죄로 갈려도 낸 대로 셈: 유죄 3 : 무죄 2 → 두 화면에 추방 글 (사람 2 + 봇 4 = 6명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const people = [user, b];
    const logs = people.map((p) => A.socketLog(p.page));
    const { t, d } = await A.startTrial(table, { humans: people, bots: 4 });
    const [b0, b1, b2] = await A.votersOf(t, d);
    // 봇 유죄 2·무죄 1 + 사람 유죄 1·무죄 1 = 유죄 3 : 무죄 2
    await A.botsTribunal(t, [[b0, 'GUILTY'], [b1, 'GUILTY'], [b2, 'NOT_GUILTY']]);
    await A.pressVote(user.page, 'GUILTY');
    await A.expectVoteAccepted(logs[0], 'GUILTY', 1);
    await A.pressVote(b.page, 'NOT_GUILTY');
    await A.expectVoteAccepted(logs[1], 'NOT_GUILTY', 1);
    const s = await A.endTribunal(t);
    // 내 유죄가 빠지면 2:2로 풀려남 → 처형됐으면 낸 대로 센 것
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
    await Promise.all(people.map((p) => A.expectExpelReadable(p.page, d.nickname)));
});
