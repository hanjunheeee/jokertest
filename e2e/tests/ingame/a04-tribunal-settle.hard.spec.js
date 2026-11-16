'use strict';

// "다 누르면 5초 뒤 판정" 어려운 시험: 사람 여럿 화면이 같이 "[5초 뒤 마감]"을 보고 같이 닫힘, 아무도 안 누름, 5초 안에 피고 나감(피고 사망·바로 밤)·새로고침, 큰 판 이틀 — 손잡이 없이 진짜 시간으로 기다림
// 목록 A04-H-006·007·027·028·029·040 (시험목록/A04-재판.md "브라우저 — 어려움", @realtime)
const { test, expect } = require('../../helpers/fixtures');
const { hostGame } = require('../room/roomHelpers');
const A = require('./_a04-multi');

const { trial } = A;

// 사람 n명 더 열기 (각자 다른 계정)
async function addPeople(players, n, o = {}) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add(o));
    return out;
}

// 마지막 사람이 누른 순간부터: 모든 화면에 "5초 뒤 마감" → 5초(±1.5초) 뒤 모든 화면 재판 창이 같이 닫힘
async function expectSettleTogether(people, lastVoter, vote) {
    for (const p of people) await A.expectNoSettle(p.page);
    const pressedAt = Date.now();
    await trial.button(lastVoter.page, vote).click();
    await Promise.all(people.map((p) => A.expectSettleShown(p.page, { light: true })));
    const closed = await Promise.all(people.map((p) => A.closedAt(p.page, { timeout: 10000 })));
    for (const at of closed) A.expectNear(at - pressedAt, 5000, '다 누른 뒤 재판 창이 닫히기까지');
    expect(Math.max(...closed) - Math.min(...closed), '화면들이 같이 닫힘').toBeLessThanOrEqual(A.TOLERANCE_MS);
}

test('A04-H-006 사람만 5명 판: 피고 뺀 넷이 다 누르면 다섯 화면 다 "[5초 뒤 마감]", 5초 뒤 같이 닫힘 @game @hard @realtime @smoke', async ({ user, players }) => {
    test.setTimeout(360_000);
    const guests = await addPeople(players, 4);
    const people = [user, ...guests];
    const defendant = guests[3];
    // 봇이 없어 방장(사람)이 화면으로 방을 만듦, 두 번째 사람이 광대
    const roles = Object.fromEntries(people.map((p, i) => [A.uuidOf(p), i === 1 ? 'JOKER' : 'CITIZEN']));
    for (const p of people) await A.pinTimebar(p.page);
    const t = await hostGame({ host: user, guests, roles, settings: { maxPlayers: 5, vote: 90, tribunal: 120 } });
    await A.afterStart(t, roles);
    await A.toVote(t, 1);
    await A.toTribunal(t, defendant);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    await A.expectNoticeReadable(trial.defendantNotice(defendant.page));
    const voters = people.filter((p) => p !== defendant);
    for (const p of voters.slice(0, 3)) await A.pressVote(p.page, 'GUILTY');
    await expectSettleTogether(people, voters[3], 'GUILTY');
});

test('A04-H-007 사람 5 + 봇 5 = 10명 판: 다 누르면 다섯 화면 다 "[5초 뒤 마감]", 5초 뒤 같이 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const people = [user, ...(await addPeople(players, 4))];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 5 });
    await A.botsTribunal(t, 'GUILTY', await A.votersOf(t, d));
    for (const p of people.slice(0, 4)) await A.pressVote(p.page, 'GUILTY');
    await expectSettleTogether(people, people[4], 'GUILTY');
});

test('A04-H-027 아무도 안 누르면 15초 뒤 세 화면이 같이 밤으로, 무죄 (사람 3 + 봇 2 = 5명, 재판 15초) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, ...(await addPeople(players, 2))];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 2, settings: { tribunalTime: 15 } });
    const deadline = await A.tribunalDeadline(t);
    // 손잡이 없이 재판 15초를 그대로 기다림
    const closed = await Promise.all(people.map((p) => A.closedAt(p.page, { timeout: 20000 })));
    for (const at of closed) A.expectNear(at, deadline, '재판 15초 마감에 창이 닫힘');
    expect(Math.max(...closed) - Math.min(...closed), '세 화면이 같이 닫힘').toBeLessThanOrEqual(A.TOLERANCE_MS);
    for (const p of people) {
        await expect(trial.nightNotice(p.page)).toBeVisible({ timeout: 10000 });
        await expect(trial.expulsion(p.page)).toHaveCount(0);
    }
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
});

test('A04-H-028 5초 당김 1초 뒤 피고(사람)가 스스로 나가면 나머지 화면은 5초를 안 기다리고 바로 밤, 그 사람은 사망 (사람 3 + 봇 4 = 7명) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [b, c] = await addPeople(players, 2);
    const { t } = await A.startTrial(table, { humans: [user, b, c], bots: 4, pick: () => c });
    await A.botsTribunal(t, 'GUILTY', t.bots);
    await A.pressVote(user.page, 'GUILTY');
    await trial.button(b.page, 'GUILTY').click();
    const pulled = await t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p.phase === 'TRIBUNAL', timeoutMs: 5000 });
    await A.sleepUntil(pulled.deadline - 4000);
    // 닫히는 시각은 나가기 전에 재기 시작 (나간 뒤에 재면 늦게 잡힘)
    const closing = Promise.all([user, b].map((p) => A.closedAt(p.page, { timeout: 8000 })));
    await A.leaveByBack(c.page);
    const closed = await closing;
    for (const at of closed) expect(pulled.deadline - at, '당긴 마감(5초)보다 먼저 닫힘').toBeGreaterThan(A.TOLERANCE_MS);
    // 결정: 처형도 "재판 취소"도 아니라 피고 사망 — 추방 연출 없이 밤, 나간 사람 카드는 사망
    for (const p of [user, b]) {
        await expect(trial.nightNotice(p.page)).toBeVisible({ timeout: 10000 });
        await expect(trial.expulsion(p.page)).toHaveCount(0);
        await expect(trial.seat(p.page, A.nickOf(c))).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 10000 });
    }
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, A.uuidOf(c)).alive).toBe(false);
});

test('A04-H-029 5초 중 한 사람이 새로고침해도 "[5초 뒤 마감]"·줄어든 남은 시간이 보이고 다른 사람과 같은 때 판정 (사람 2 + 봇 6 = 8명) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [b] = await addPeople(players, 1);
    const { t, d } = await A.startTrial(table, { humans: [user, b], bots: 6 });
    await A.botsTribunal(t, 'NOT_GUILTY', await A.votersOf(t, d));
    await A.pressVote(b.page, 'NOT_GUILTY');
    await trial.button(user.page, 'NOT_GUILTY').click();
    const pulled = await t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p.phase === 'TRIBUNAL', timeoutMs: 5000 });
    const closingB = A.closedAt(b.page, { timeout: 10000 });
    await user.page.reload();
    await expect(trial.win(user.page)).toBeVisible({ timeout: 4000 });
    // 새로고침 뒤 화면에 보이는 남은 시간·"[5초 뒤 마감]" 글을 읽어 둠 (판정 시각을 먼저 보고 아래에서 확인)
    let shown = null;
    let settleSeen = false;
    await expect.poll(async () => {
        settleSeen = settleSeen || await trial.settleLabel(user.page).isVisible().catch(() => false);
        shown = (await A.clockSeconds(user.page)) ?? shown;
        return shown !== null && settleSeen;
    }, { timeout: 2500 }).toBe(true).catch(() => {});
    const [atA, atB] = await Promise.all([A.closedAt(user.page, { timeout: 8000 }), closingB]);
    A.expectNear(atA, pulled.deadline, '새로고침한 화면이 당겨진 마감에 닫힘');
    A.expectNear(atB, pulled.deadline, '다른 사람 화면이 당겨진 마감에 닫힘');
    expect(Math.abs(atA - atB), '두 화면이 같은 때 닫힘').toBeLessThanOrEqual(A.TOLERANCE_MS);
    // 120초 재판인데 새로고침 뒤 화면 남은 시간이 5초 이하로 보임
    expect(shown, '새로고침 뒤 시간 바에 남은 시간이 보임').not.toBeNull();
    expect(shown).toBeLessThanOrEqual(5);
    // 당김 표시도 새로고침 뒤 살아 있음 (서버가 다시 준 판 값에 실림)
    expect(settleSeen, '새로고침 뒤 시간 바에 "[5초 뒤 마감]"이 보임').toBe(true);
});

test('A04-H-040 큰 판 이틀: 1·2일 재판 모두 다 누르면 5초 뒤 판정, 다섯 화면(PC 3·모바일 2) 같이 (사람 5 + 봇 5 = 10명) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(480_000);
    const pcs = [user, ...(await addPeople(players, 2))];
    const phones = await addPeople(players, 2, { mobile: true });
    const people = [...pcs, ...phones];
    const { t, d } = await A.startTrial(table, { humans: people, bots: 5 });
    for (const day of [1, 2]) {
        if (day === 2) {
            await A.toVote(t, 2);
            await A.toTribunal(t, d);
            for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
            // 버그 8: 1일에 누른 다섯 사람 모두 2일에도 단추
            for (const p of people) {
                await expect(trial.done(p.page)).toHaveCount(0);
                await A.expectButtonsReadable(p.page);
            }
        }
        // 날마다 모두 무죄 → 같은 봇이 이틀 다 피고
        await A.botsTribunal(t, 'NOT_GUILTY', await A.votersOf(t, d));
        for (const p of people.slice(0, 4)) await A.pressVote(p.page, 'NOT_GUILTY');
        await expectSettleTogether(people, people[4], 'NOT_GUILTY');
        const s = await A.waitState(t, (g) => g.phase === 'NIGHT' && g.dayIndex === day, { message: `${day}일 재판 뒤 밤` });
        expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
    }
});
