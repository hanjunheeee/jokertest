'use strict';

// 밤 암살로 판이 끝나는 시험(어려움, 처음부터 끝까지): 산 광대 수가 나머지와 같아지는 밤에 광대 승, 사람 여럿 화면의 결과 화면
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-016·017·030 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-night-win-hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf } = kit;

test('A05-H-016 5명 광대2 광대 사람 2명 처음부터 끝까지: 첫날 투표·재판(무죄) → 첫 밤 같은 시민 암살 → 두 화면 광대 승 결과 화면 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const jokers = [user, await players.add()];
    // 낮 투표는 사람이 화면으로 내서 넉넉히 90초 (마감은 손잡이로 넘김)
    const g = await kit.seat(table, { humans: jokers, bots: 3, humanRoles: ['JOKER', 'JOKER'], settings: { jokerCount: 2, dayVoteTime: 90 } });
    const [voterA, voterB, defendant] = g.bots.CITIZEN;

    // 첫날 낮 투표: 사람 둘은 화면으로, 봇 둘은 요청으로 시민 하나에게 (4표 > 기권 1) → 재판
    await g.t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    for (const h of jokers) await kit.voteUi(h.page, nickOf(defendant));
    for (const bot of [voterA, voterB]) {
        const r = await bot.request('cast_day_vote', { gameId: g.t.gameId, targetId: uuidOf(defendant) });
        expect(r?.ok, `봇 낮 표 (${r?.code ?? ''})`).toBe(true);
    }
    await g.t.advance();
    await kit.waitState(g.t, (s) => s.phase === 'TRIBUNAL' && s.tribunal?.defendantUuid === uuidOf(defendant), '재판 열림');
    // 재판: 봇 둘이 무죄, 사람은 안 냄 → 유죄가 더 많지 않아 처형 없이 첫 밤
    for (const bot of [voterA, voterB]) {
        const r = await bot.request('cast_tribunal_vote', { gameId: g.t.gameId, dayIndex: 1, vote: 'NOT_GUILTY' });
        expect(r?.ok, `봇 재판 표 (${r?.code ?? ''})`).toBe(true);
    }
    await g.t.advance();
    const atNight = await kit.waitState(g.t, (s) => s.phase === 'NIGHT' && s.dayIndex === 1, '첫 밤');
    expect(atNight.players.filter((p) => p.alive)).toHaveLength(5);

    // 첫 밤: 두 광대가 같은 시민 → 광대 2 : 나머지 2 → 광대 승
    await kit.playNight(g.t, {
        JOKER: async () => { for (const h of jokers) await kit.pickNight(h.page, nickOf(voterA), 'JOKER'); },
    });
    for (const h of jokers) await kit.expectResultScreen(h.page, { outcome: '승리', team: '광대 진영 승리' });
});

test('A05-H-017 6명 광대1 시민 사람 3명 + 봇 3: 밤 암살이 이어져 1:1이 되는 밤에 광대 승, 사람 3명(살아 있던 사람 포함) 결과 화면 패배 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add(), await players.add()];
    const g = await kit.seat(table, { humans: people, bots: 3, humanRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    const [citizen] = g.bots.CITIZEN;
    // 밤마다 광대 봇이 한 명씩: 의사 봇 → 시민 봇 → 사람 1 → 사람 2 (낮엔 아무도 표를 안 내 재판 없음, 의사 봇은 안 지킴)
    // 광대 1 : 나머지 5 → 4 → 3 → 2 → 1 (같아지는 넷째 밤에 끝), 사람 3은 끝까지 살아 있음
    const victims = [doctor, citizen, people[0], people[1]];
    for (const [i, victim] of victims.entries()) {
        await kit.toNight(g.t, i + 1);
        const { after } = await kit.playNight(g.t, { JOKER: () => kit.botPick(g.t, joker, uuidOf(victim)) });
        if (i < victims.length - 1) {
            // 아직 안 끝남: 다음 낮, 세 화면 다 그 사람 카드가 사망
            expect(after.phase).toBe('DAY');
            for (const h of people) await kit.expectCardStatus(h.page, nickOf(victim), 'dead');
        } else {
            expect(after.phase).toBe('ENDED');
        }
    }
    for (const h of people) await kit.expectResultScreen(h.page, { outcome: '패배', team: '광대 진영 승리' });
});

test('A05-H-030 7명 직접{광대2·의사1·경비원1} 광대 2·의사·경비원 사람 4명: 의사가 매번 딴 사람을 지켜 못 막음 → 2:2가 되는 밤에 광대 승, 네 화면 결과 화면 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const jokerA = user;
    const jokerB = await players.add();
    const doctor = await players.add();
    const guard = await players.add();
    const g = await kit.seat(table, {
        humans: [jokerA, jokerB, doctor, guard], bots: 3, humanRoles: ['JOKER', 'JOKER', 'DOCTOR', 'GUARD'],
        settings: night.custom({ JOKER: 2, DOCTOR: 1, GUARD: 1 }),
    });
    const [c1, c2, c3] = g.bots.CITIZEN;
    const bothJokers = (nickname) => async () => {
        await kit.pickNight(jokerA.page, nickname, 'JOKER');
        await kit.pickNight(jokerB.page, nickname, 'JOKER');
    };

    // 첫 밤 (광대 2 : 나머지 5): 광대 둘 → 시민1, 의사 → 시민2(갈림), 경비원 → 광대 A 조사
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: bothJokers(nickOf(c1)),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(c2), 'DOCTOR'),
        GUARD: () => kit.pickNight(guard.page, nickOf(jokerA), 'GUARD'),
    });
    await kit.expectRoleResult(guard.page, nickOf(jokerA), 'JOKER');
    await kit.closeResult(guard.page);
    for (const h of [jokerA, jokerB, doctor, guard]) await kit.expectCardStatus(h.page, nickOf(c1), 'dead');

    // 둘째 밤 (2 : 4): 광대 둘 → 시민2, 의사 → 시민3(갈림), 경비원은 안 고름
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: bothJokers(nickOf(c2)),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(c3), 'DOCTOR'),
    });
    for (const h of [jokerA, jokerB, doctor, guard]) await kit.expectCardStatus(h.page, nickOf(c2), 'dead');

    // 셋째 밤 (2 : 3): 광대 둘 → 의사 사람, 찍힌 의사는 경비원을 지킴(자기를 안 지켜 죽음) → 2 : 2 광대 승
    await kit.toNight(g.t, 3);
    const { after } = await kit.playNight(g.t, {
        JOKER: bothJokers(nickOf(doctor)),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(guard), 'DOCTOR'),
    });
    expect(after.phase).toBe('ENDED');
    for (const h of [jokerA, jokerB]) await kit.expectResultScreen(h.page, { outcome: '승리', team: '광대 진영 승리' });
    for (const h of [doctor, guard]) await kit.expectResultScreen(h.page, { outcome: '패배', team: '광대 진영 승리' });
});
