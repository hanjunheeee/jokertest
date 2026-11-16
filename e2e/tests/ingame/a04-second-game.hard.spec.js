'use strict';

// 같은 방 둘째 판 재판 어려운 시험(받은 버그 8): 첫 판 1일 재판에서 누른 사람들이 "대기방으로" 돌아와 시작한 둘째 판의 1일·2일 재판에서도 단추를 봄
// 목록 A04-H-022·023 (시험목록/A04-재판.md "브라우저 — 어려움") — 사람만 5명 판이라 방장(사람)이 화면으로 방을 만듦
const { test, expect } = require('../../helpers/fixtures');
const { hostGame } = require('../room/roomHelpers');
const A = require('./_a04-multi');

const { trial } = A;

// 사람 5명으로 첫 판: 1일 재판에서 넷이 유죄 → 하나뿐인 광대(다섯째 사람) 처형 → 시민 승 → 다섯 다 "대기방으로"
async function playFirstGame(user, players) {
    const guests = [];
    for (let i = 0; i < 4; i += 1) guests.push(await players.add());
    const people = [user, ...guests];
    const roles = Object.fromEntries(people.map((p, i) => [A.uuidOf(p), i === 4 ? 'JOKER' : 'CITIZEN']));
    const first = await hostGame({ host: user, guests, roles, settings: { maxPlayers: 5, vote: 90, tribunal: 120 } });
    await A.afterStart(first, roles);
    await A.toVote(first, 1);
    await A.toTribunal(first, people[4]);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    for (const p of people.slice(0, 4)) await A.pressVote(p.page, 'GUILTY');
    const s = await A.endTribunal(first);
    expect(s.phase).toBe('ENDED');
    await Promise.all(people.map((p) => A.expectResult(p.page, A.TEXT.citizenWin)));
    // 방장부터 차례로 대기방으로
    for (const p of people) {
        await p.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(p.page).toHaveURL(/\/game-matching/, { timeout: 15000 });
    }
    return { people, guests, first };
}

// 둘째 판 시작: 이번엔 둘째 사람이 광대, 넷째 사람이 재판 피고 (첫 판에서 유죄를 누른 사람들)
async function startSecondGame(user, guests, people, first) {
    const roles = Object.fromEntries(people.map((p, i) => [A.uuidOf(p), i === 1 ? 'JOKER' : 'CITIZEN']));
    const second = await A.startNextGame({ host: user, guests, roles });
    expect(second.gameId).not.toBe(first.gameId);
    return second;
}

// 피고 뺀 넷 화면에 완료 글이 미리 떠 있지 않고 단추가 읽히는지
async function expectButtonsFor(voters) {
    for (const p of voters) {
        await expect(trial.done(p.page)).toHaveCount(0);
        await A.expectButtonsReadable(p.page);
    }
}

test('A04-H-022 [버그 8] 같은 방 둘째 판 1일 재판에서도 단추가 읽히고 눌러짐 (사람 5 = 5명) @game @hard @smoke', async ({ user, players }) => {
    test.setTimeout(480_000);
    const { people, guests, first } = await playFirstGame(user, players);
    const second = await startSecondGame(user, guests, people, first);
    const defendant = people[3];
    await A.toVote(second, 1);
    await A.toTribunal(second, defendant);
    const voters = people.filter((p) => p !== defendant);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    await expectButtonsFor(voters);
    for (const p of voters) await A.pressVote(p.page, 'NOT_GUILTY');
});

test('A04-H-023 [버그 8] 같은 방 둘째 판 2일 재판에서도 단추가 읽히고 눌러짐 (사람 5 = 5명) @game @hard', async ({ user, players }) => {
    test.setTimeout(540_000);
    const { people, guests, first } = await playFirstGame(user, players);
    const second = await startSecondGame(user, guests, people, first);
    const defendant = people[3];
    const voters = people.filter((p) => p !== defendant);
    // 둘째 판 1일: 넷 다 무죄 → 풀려남
    await A.toVote(second, 1);
    await A.toTribunal(second, defendant);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    for (const p of voters) await A.pressVote(p.page, 'NOT_GUILTY');
    const s = await A.endTribunal(second);
    expect(A.playerOf(s, A.uuidOf(defendant)).alive).toBe(true);
    // 둘째 판 2일: 같은 사람이 피고 → 넷 다 단추
    await A.toVote(second, 2);
    await A.toTribunal(second, defendant);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    await expectButtonsFor(voters);
    for (const p of voters) await A.pressVote(p.page, 'GUILTY');
});
