'use strict';

// 밤 판정 브라우저 시험 (PC) — 암살·보호·건너뛰기 뒤 낮 화면의 사망 카드, 죽은 사람은 직업이 안 보임, 죽은 나는 다음 밤 행동 없음, 직업 넷 다 있는 판 한 밤
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-065~074·161·162·168~174·182~185, 모이는지만 봄: npx playwright test --list tests/ingame/a05-night-resolve.spec.js
const { test, expect } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

// 화면에 나오는 직업 이름 (죽은 사람 카드에 이 글이 있으면 직업이 샌 것)
const ROLE_WORDS = /광대|시민|의사|경비원|마녀사냥꾼/;

test('A05-E-065 5명 시민 사람이 암살됨: 낮에 내 카드 사망, 둘째 낮 투표 때 누를 수 있는 투표 단추가 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'CITIZEN', botRoles: ['JOKER', 'CITIZEN'], settings: { dayVoteTime: 60 } });
    const [joker, citizen] = t.bots;
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: joker }, picks: { JOKER: user } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDead(page, user);
    // 투표 단계로 (봇은 표를 안 냄 → 투표 시간 동안 화면을 볼 수 있음)
    await t.advance();
    await k.waitState(t, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE', '둘째 낮 투표 단계');
    // 죽은 사람 화면: 카드 메뉴의 "투표하기"는 꺼진 채 보이고, 기권 단추는 아예 안 그려짐 (utils/playerCardMenu.js·InGameCornerActionPanel.jsx)
    expect(await k.itemState(page, k.nick(citizen), k.VOTE_ITEM_NAMES), '산 사람 카드의 투표 항목').toBe('잠김');
    await expect(page.locator('[data-ingame-phase-action="dayVoteAbstain"]'), '죽은 사람 화면 기권 단추').toHaveCount(0);
    const s = await t.state();
    expect({ phase: s.phase, dayPhase: s.dayPhase }, '투표 단계 동안 본 것').toEqual({ phase: 'DAY', dayPhase: 'DAY_VOTE' });
});

test('A05-E-066 6명 시민 사람: 다른 시민이 암살되면 낮에 그 카드가 사망으로 보이고 직업은 안 보임 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'CITIZEN', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: joker }, picks: { JOKER: victim } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDead(page, victim);
    await k.expectDeadBadgeReadable(page, victim);
    // 카드엔 닉네임과 "사망"만, 직업 이름은 없음
    await expect(k.card(page, k.nick(victim))).toContainText('사망');
    await expect(k.card(page, k.nick(victim))).not.toContainText(ROLE_WORDS);
});

test('A05-E-067 6명 시민 사람: 의사 봇이 광대 대상을 살리면 낮에 사망 카드 0 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN'] });
    const [joker, doctor, target] = t.bots;
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: joker, DOCTOR: doctor }, picks: { JOKER: target, DOCTOR: target } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, []);
});

test('A05-E-068 5명 시민 사람: 광대 봇이 건너뛰면 낮에 사망 카드 0 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'CITIZEN', botRoles: ['JOKER'] });
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: t.bots[0] }, picks: { JOKER: null } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, []);
});

// 광대 사람 첫 밤 암살 (자동 구성): [번호, 인원]
for (const [no, players] of [['A05-E-069', 5], ['A05-E-070', 6], ['A05-E-071', 7], ['A05-E-072', 8], ['A05-E-073', 9], ['A05-E-074', 10]]) {
    test(`${no} ${players}명 자동 구성 광대 사람 첫 밤 암살: 낮에 그 사람만 사망, 산 사람 ${players - 1}명 @game`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, { bots: players - 1, me: 'JOKER', botRoles: ['CITIZEN'] });
        const victim = t.bots[0];
        await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: victim } });
        await k.toDay(t, 2);
        await k.dayShown(page, 2);
        await k.expectDeadNames(page, [victim]);
        await k.expectAliveCount(page, players - 1);
    });
}

test('A05-E-161 6명 시민 사람: 희생자 카드의 사망 표시가 눈에 보이고 직업 그림으로 안 바뀜 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'CITIZEN', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.toDay(t, 1);
    await k.dayShown(page, 1);
    const before = await k.portraitSrc(page, victim);
    expect(before, '카드 초상 그림 (준비 확인)').toBeTruthy();
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: joker }, picks: { JOKER: victim } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDead(page, victim);
    await k.expectDeadBadgeReadable(page, victim);
    // 초상은 죽기 전 그림 그대로 (직업 그림으로 안 바뀜)
    expect(await k.portraitSrc(page, victim), '죽은 뒤 카드 초상 그림').toBe(before);
});

test('A05-E-162 8명 경비원 사람이 첫 밤 암살됨: 둘째 밤 경비원 차례에 내 화면엔 누를 수 있는 밤 항목 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, me: 'GUARD', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, citizen] = t.bots;
    await k.playNight({ t, page, me: 'GUARD', who: { JOKER: joker }, picks: { JOKER: user } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDead(page, user);
    // 둘째 밤: 화면이 밤까지 따라온 뒤 경비원 차례로 (다 죽은 직업 차례는 잠깐만 열려 있어 미리 화면을 맞춤)
    await n.toNight(t, { dayIndex: 2 });
    await k.nightShown(page, 2);
    await n.toTurn(t, 'GUARD', { dayIndex: 2 });
    // 죽은 사람도 자기 직업 차례엔 밤 항목이 꺼진 채 보임 (utils/playerCardMenu.js, 까닭 "사망한 플레이어는 행동할 수 없습니다"), 건너뛰기 단추는 안 그려짐
    expect(await k.itemState(page, k.nick(joker)), '광대 카드 밤 항목').toBe('잠김');
    await expect(n.skipButton(page), '죽은 사람 화면 건너뛰기 단추').toHaveCount(0);
    await k.expectTurn(t, 'GUARD', 2);
    expect(await k.itemState(page, k.nick(citizen)), '시민 카드 밤 항목').toBe('잠김');
    // 두 번째로 본 것도 그 차례 안이었음 (빈 차례는 무작위로 일찍 닫힘)
    await k.expectTurn(t, 'GUARD', 2);
});

/**
 * 직업 넷 다 있는 10명 판(직접{광대1·의사1·경비원1·마녀사냥꾼1}): 첫날 시민 Z를 처형해 둘째 밤 앞까지
 * → who: 직업 → 그 사람(사람 직업 칸은 user), z: 처형된 시민, a·b: 산 시민
 */
async function fullHouse(table, user, me) {
    const others = k.TURN_ORDER.filter((role) => role !== me);
    const { t, page } = await k.open(table, user, {
        bots: 9,
        settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }),
        me,
        botRoles: [...others, 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    const who = { [me]: user };
    others.forEach((role, i) => { who[role] = t.bots[i]; });
    const [z, a, b] = t.bots.slice(others.length);
    await k.execute(t, z);
    return { t, page, who, z, a, b };
}

test('A05-E-168 넷 다 있는 10명 판 둘째 밤 ① 경비원 사람: 광대→A·의사→A·경비원→광대·마녀사냥꾼→Z → 결과 창 "광대", 새 사망 카드 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z, a } = await fullHouse(table, user, 'GUARD');
    await k.playNight({ t, page, me: 'GUARD', night: 2, who, picks: { JOKER: a, DOCTOR: a, GUARD: who.JOKER, WITCH_HUNTER: z } });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'INVESTIGATE', who.JOKER, 'JOKER');
    await k.expectDeadNames(page, [z]);
});

test('A05-E-169 넷 다 있는 10명 판 둘째 밤 ② 마녀사냥꾼 사람: 광대→경비원·의사→자기·경비원→광대·마녀사냥꾼→Z → 경비원 카드 사망, 내 결과 창은 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z } = await fullHouse(table, user, 'WITCH_HUNTER');
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, who, picks: { JOKER: who.GUARD, DOCTOR: who.DOCTOR, GUARD: who.JOKER, WITCH_HUNTER: z } });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'CONFIRM', z, 'CITIZEN');
    await k.expectDeadNames(page, [z, who.GUARD]);
    // 찍혀 죽은 경비원 봇은 결과를 못 받음
    expect(n.eventsOf(who.GUARD, 'night_action_result'), '죽은 경비원 봇이 받은 개인 결과').toEqual([]);
});

test('A05-E-170 넷 다 있는 10명 판 둘째 밤 ③ 광대 사람: 광대→마녀사냥꾼·의사→마녀사냥꾼·마녀사냥꾼→Z → 마녀사냥꾼 살아 있음, 내겐 암살 실패 글 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z } = await fullHouse(table, user, 'JOKER');
    await k.playNight({ t, page, me: 'JOKER', night: 2, who, picks: { JOKER: who.WITCH_HUNTER, DOCTOR: who.WITCH_HUNTER, WITCH_HUNTER: z } });
    await k.toDay(t, 3);
    await k.expectResult(page, 'ASSASSINATE', ['이번 밤의 암살이 실패했습니다.']);
    await k.expectAlive(page, who.WITCH_HUNTER);
    await k.expectDeadNames(page, [z]);
    // 살아난 마녀사냥꾼 봇은 확인 결과를 받음
    expect(n.eventsOf(who.WITCH_HUNTER, 'night_action_result'), '마녀사냥꾼 봇이 받은 개인 결과').toHaveLength(1);
});

test('A05-E-171 넷 다 있는 10명 판 둘째 밤 ④ 의사 사람: 광대→의사·의사→경비원·경비원→A → 내 카드 사망, 내 결과 창 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z, a } = await fullHouse(table, user, 'DOCTOR');
    await k.playNight({ t, page, me: 'DOCTOR', night: 2, who, picks: { JOKER: user, DOCTOR: who.GUARD, GUARD: a } });
    await k.toDay(t, 3);
    await k.expectNoNewResult(page, 3);
    await k.expectDeadNames(page, [z, user]);
    // 경비원 봇은 조사 결과를 받음
    expect(n.eventsOf(who.GUARD, 'night_action_result'), '경비원 봇이 받은 개인 결과').toHaveLength(1);
});

test('A05-E-172 넷 다 있는 10명 판 둘째 밤 ⑤ 경비원 사람: 전원 건너뜀 → 새 사망 카드 없음, 결과 창 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z } = await fullHouse(table, user, 'GUARD');
    await k.playNight({ t, page, me: 'GUARD', night: 2, who, picks: { JOKER: null, DOCTOR: null, GUARD: null, WITCH_HUNTER: null } });
    await k.toDay(t, 3);
    await k.expectNoNewResult(page, 3);
    await k.expectDeadNames(page, [z]);
});

test('A05-E-173 넷 다 있는 10명 판 둘째 밤 ⑥ 마녀사냥꾼 사람: 광대→시민 B·의사→광대·경비원→A·마녀사냥꾼→Z → B 카드 사망, 내 결과 창은 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page, who, z, a, b } = await fullHouse(table, user, 'WITCH_HUNTER');
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, who, picks: { JOKER: b, DOCTOR: who.JOKER, GUARD: a, WITCH_HUNTER: z } });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'CONFIRM', z, 'CITIZEN');
    await k.expectDeadNames(page, [z, b]);
    // 결과는 경비원·마녀사냥꾼만: 광대·의사 봇은 개인 결과 없음
    expect(n.eventsOf(who.JOKER, 'night_action_result'), '광대 봇이 받은 개인 결과').toEqual([]);
    expect(n.eventsOf(who.DOCTOR, 'night_action_result'), '의사 봇이 받은 개인 결과').toEqual([]);
});

test('A05-E-174 6명 광대 사람이 고른 봇이 밤 중(의사 차례)에 판을 나감: 낮에 암살 연출도 새 사망 카드도 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'JOKER', botRoles: ['DOCTOR', 'CITIZEN'] });
    const leaver = t.bots[1];
    await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: leaver } });
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    const left = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, '봇 나가기를 서버가 받음').toBe(true);
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    // 밤에 죽은 사람 없음: 암살 영상이 안 떴고, 나간 사람 말고는 사망 카드가 없음 (나간 사람 카드 표시는 A09 몫)
    expect((await n.readUi(page)).kills, '암살 영상이 뜬 수').toBe(0);
    expect((await k.deadNames(page)).filter((name) => name !== k.nick(leaver)), '나간 사람을 뺀 사망 카드').toEqual([]);
});

test('A05-E-182 6명 의사 사람은 자기를 보호하고 광대 봇은 딴 사람을 노림: 그 사람 사망 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: victim, DOCTOR: user } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, [victim]);
});

test('A05-E-183 6명 의사 사람이 건너뛰기를 누름: 광대 대상 사망 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: victim, DOCTOR: null } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, [victim]);
});

test('A05-E-184 5명 광대 사람이 건너뛰기 단추를 누름: 낮에 사망 카드 0 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'JOKER' });
    await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: null } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, []);
});

test('A05-E-185 8명 경비원 사람이 건너뛰기를 누름: 결과 창 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, me: 'GUARD' });
    await k.playNight({ t, page, me: 'GUARD', picks: { GUARD: null } });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
});
