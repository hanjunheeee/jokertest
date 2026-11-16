'use strict';

// 재판이 낀 판을 처음부터 끝까지 가는 어려운 시험: 사흘 재판(무죄 → 유죄 → 마지막 광대 처형) 뒤 시민 승, 사람만 5명 판에서 시민 처형으로 광대 승
// 목록 A04-H-019·020 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const { hostGame } = require('../room/roomHelpers');
const A = require('./_a04-multi');

const { trial } = A;

// 그 날 재판을 열고 사람 화면마다 재판 창이 뜰 때까지
async function openDay(t, day, defendant) {
    await A.toVote(t, day);
    await A.toTribunal(t, defendant);
    for (const h of t.humans) await expect(trial.win(h.page)).toBeVisible({ timeout: 15000 });
}

// 사람마다 단추가 읽히는지 본 뒤 같은 표를 누름
async function allPress(people, vote) {
    for (const p of people) {
        await expect(trial.done(p.page)).toHaveCount(0);
        await A.expectButtonsReadable(p.page);
    }
    for (const p of people) await A.pressVote(p.page, vote);
}

test('A04-H-019 여러 날 재판 처음부터 끝까지: 1일 무죄 → 2일 유죄 → 3일 마지막 광대 처형으로 판 끝, 날마다 세 사람 단추·결과 (사람 3 + 봇 7 = 10명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(480_000);
    const people = [user, await players.add(), await players.add()];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 7 });
    // 1일: 셋 다 무죄(봇은 기권) → 풀려남, 추방 연출 없이 밤 안내
    await allPress(people, 'NOT_GUILTY');
    let s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
    for (const p of people) {
        await expect(trial.nightNotice(p.page)).toBeVisible({ timeout: 10000 });
        await expect(trial.expulsion(p.page)).toHaveCount(0);
    }
    // 2일: 같은 봇이 피고, 셋 다 유죄 → 처형, 세 화면 추방 글
    await openDay(t, 2, d);
    await allPress(people, 'GUILTY');
    s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
    expect(s.phase).toBe('NIGHT');
    await Promise.all(people.map((p) => A.expectExpelReadable(p.page, d.nickname)));
    // 3일: 하나뿐인 광대(첫 봇)가 피고, 셋 다 유죄 → 판 끝, 세 화면 결과 시민 승
    await openDay(t, 3, t.bots[0]);
    await allPress(people, 'GUILTY');
    s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    await Promise.all(people.map((p) => A.expectResult(p.page, A.TEXT.citizenWin)));
});

test('A04-H-020 사람만 5명 판: 1일 재판에서 시민이 처형되면 광대 2 ≥ 나머지 2 → 다섯 화면 결과 광대 승 (5명, 광대 2) @game @hard', async ({ user, players }) => {
    test.setTimeout(360_000);
    const guests = [];
    for (let i = 0; i < 4; i += 1) guests.push(await players.add());
    const people = [user, ...guests];
    const defendant = guests[3];
    // 봇이 없어 방장(사람)이 화면으로 방을 만듦: 앞 두 사람이 광대
    const roles = Object.fromEntries(people.map((p, i) => [A.uuidOf(p), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: user, guests, roles, settings: { maxPlayers: 5, jokers: 2, vote: 90, tribunal: 120 } });
    await A.afterStart(t, roles);
    await A.toVote(t, 1);
    await A.toTribunal(t, defendant);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    const voters = people.filter((p) => p !== defendant);
    for (const p of voters) await A.pressVote(p.page, 'GUILTY');
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    await Promise.all(people.map((p) => A.expectResult(p.page, A.TEXT.jokerWin)));
});
