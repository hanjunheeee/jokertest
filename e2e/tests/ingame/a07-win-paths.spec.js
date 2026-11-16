'use strict';

// 승패가 나는 길 브라우저 시험 (PC) — 처형·밤 암살·나감·60초 탈락으로 승부가 나면 결과 화면에 이긴 진영, 안 났으면 판 계속
// 목록 시험목록/A07-승패-결과-골드.md A07-E-001~010·129~132, 모이는지만 봄: npx playwright test --list tests/ingame/a07-win-paths.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const day = require('./a-day/_lib');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;

// 의사가 살렸을 때 낮 시작 글 (누구였는지는 안 밝힘)
const SAVED_TEXT = '지난밤 의사가 공격받은 사람을 살려냈습니다';

// 결과 화면에 이긴 진영 글이 읽힘
async function expectWinner(page, winner) {
    await k.reachBoard(page);
    await expectReadable(page.getByText(k.WIN_TEXT[winner], { exact: true }));
}

// "밤이 되었습니다" 창이 읽힘 (추방 연출이 덮고 있으면 끝날 때까지 기다림)
async function expectNightNotice(page) {
    await expectReadable(page.locator('[data-ingame-phase-entrance="NIGHT"]').getByText('밤이 되었습니다'), { timeout: 30_000 });
}

// 낮 시작 연출을 봤는지 (화면 기록): 암살 영상 창이 떴고 그 아래 글에 죽은 사람 이름
async function expectDawnKill(page, victim) {
    const rec = await n.readUi(page);
    expect(rec.kills, '암살 영상 창이 뜬 수').toBeGreaterThanOrEqual(1);
    expect(rec.dawnMessages).toContain(`지난밤 ${nick(victim)}님이 살해당했습니다`);
}

test('A07-E-001 5명 판 마지막 광대 처형 → 밤 안 가고 결과 화면에 시민 진영 승리 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const [joker, watcher] = t.bots;
    const end = await k.execute(t, uid(joker));
    expect({ phase: end.phase, winner: end.winResult?.winner ?? null }).toEqual({ phase: 'ENDED', winner: 'CITIZEN' });
    await expectWinner(page, 'CITIZEN');
    // 밤 차례는 한 번도 안 열림
    expect(n.eventsOf(watcher, 'night_turn_started')).toHaveLength(0);
});

test('A07-E-002 6명 판 광대 2: 밤 암살로 2:2 → 낮 시작 연출(영상·글) 뒤 광대 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(3)]);
    const [j1, j2, executed, victim] = t.bots;
    // 첫날 시민 하나 처형 (2:3) → 판 계속
    const night1 = await k.execute(t, uid(executed));
    expect({ phase: night1.phase, winner: night1.winResult?.winner ?? null }).toEqual({ phase: 'NIGHT', winner: null });
    // 그 밤 광대 둘이 같은 시민을 고름 (2:2)
    const end = await k.nightKill(t, [j1, j2], uid(victim));
    expect({ phase: end.phase, winner: end.winResult?.winner ?? null }).toEqual({ phase: 'ENDED', winner: 'JOKER' });
    await expectWinner(page, 'JOKER');
    await expectDawnKill(page, victim);
});

test('A07-E-003 7명 판 산 광대 2·나머지 3에서 시민 처형 → 광대 진영 승리 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(4)]);
    const [j1, j2, c1, c2, c3] = t.bots;
    // 첫날 처형 (2:4) → 첫 밤 암살 (2:3) → 둘째 낮, 아직 승부 없음
    await k.execute(t, uid(c1));
    const day2 = await k.nightKill(t, [j1, j2], uid(c2));
    expect({ phase: day2.phase, day: day2.dayIndex, winner: day2.winResult?.winner ?? null }).toEqual({ phase: 'DAY', day: 2, winner: null });
    // 둘째 날 시민 처형 (2:2)
    const end = await k.execute(t, uid(c3));
    expect({ phase: end.phase, winner: end.winResult?.winner ?? null }).toEqual({ phase: 'ENDED', winner: 'JOKER' });
    await expectWinner(page, 'JOKER');
});

test('A07-E-004 8명 판 광대 봇 둘 중 하나 나가면 계속, 남은 하나도 나가면 바로 시민 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(5)]);
    const [j1, j2] = t.bots;
    await k.leave(t, j1);
    await k.expectStillPlaying(t, page);
    // 단계를 안 넘겨도 나간 직후 승부가 남
    await k.leave(t, j2);
    await expectWinner(page, 'CITIZEN');
    expect((await t.state()).winResult?.winner).toBe('CITIZEN');
});

test('A07-E-005 5명 판 광대 2: 산 2:3에서 시민 봇이 나감 → 광대 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(2)]);
    await k.expectStillPlaying(t, page);
    await k.leave(t, t.bots[2]);
    await expectWinner(page, 'JOKER');
    expect((await t.state()).winResult?.winner).toBe('JOKER');
});

test('A07-E-006 6명 판 광대 봇이 끊겨 60초 뒤 탈락(손잡이) → 시민 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    // 60초 규칙 자체는 A09 몫 → 여기선 손잡이로 바로 끝냄
    await k.dropOut(t, t.bots[0]);
    await expectWinner(page, 'CITIZEN');
    expect((await t.state()).winResult?.winner).toBe('CITIZEN');
});

test('A07-E-007 7명 판 재판 무죄 → 밤 화면, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)], { auto: false });
    const joker = t.bots[0];
    const voters = await k.toTribunal(t, uid(joker));
    const s = await k.verdict(t, voters, 'NOT_GUILTY');
    expect(s.phase).toBe('NIGHT');
    expect(n.rowOf(s, uid(joker)).alive, '무죄라 피고는 살아 있음').toBe(true);
    await expectNightNotice(page);
    await k.expectStillPlaying(t, page);
});

test('A07-E-008 8명 판 의사가 광대 대상을 살림 → 낮에 살려냈다는 글, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'DOCTOR', ...C(5)], { auto: false });
    // 단계 안내 창만 저절로 닫히게 (낮 시작 글 창은 직접 봄)
    await n.recordUi(page, { autoConfirm: true, autoConfirmDawn: false });
    const [joker, doctor, target] = t.bots;
    const day2 = await k.nightKill(t, [joker], uid(target), { save: doctor });
    expect({ phase: day2.phase, day: day2.dayIndex, alive: n.aliveCount(day2) }).toEqual({ phase: 'DAY', day: 2, alive: 8 });
    await expectReadable(page.locator('[data-ingame-dawn-report="SAVED"]').getByText(SAVED_TEXT, { exact: true }), { timeout: 30_000 });
    await k.expectStillPlaying(t, page);
});

test('A07-E-009 10명 판 낮 투표 동점(4:4) → 재판 없이 밤, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(8)], { auto: false });
    const [joker, x, y, ...rest] = t.bots;
    await t.advance();
    await day.waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
    // x에 4표(광대 + 봇 셋), y에 4표(x + 봇 셋), 사람·y는 안 냄(기권 2)
    for (const bot of [joker, ...rest.slice(0, 3)]) await k.ask(t, bot, 'cast_day_vote', { targetId: uid(x) });
    for (const bot of [x, ...rest.slice(3)]) await k.ask(t, bot, 'cast_day_vote', { targetId: uid(y) });
    await t.advance();
    const s = await day.waitState(t, (g) => g.phase !== 'DAY');
    expect({ phase: s.phase, tribunal: s.tribunal, alive: n.aliveCount(s) }).toEqual({ phase: 'NIGHT', tribunal: null, alive: 10 });
    await expectNightNotice(page);
    await k.expectStillPlaying(t, page);
});

test('A07-E-010 10명 판 광대 2명 중 1명 처형 → 밤 화면, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(7)], { auto: false });
    const [j1, j2] = t.bots;
    const s = await k.execute(t, uid(j1));
    expect(s.phase).toBe('NIGHT');
    expect({ j1: n.rowOf(s, uid(j1)).alive, j2: n.rowOf(s, uid(j2)).alive }).toEqual({ j1: false, j2: true });
    await expectNightNotice(page);
    await k.expectStillPlaying(t, page);
});

test('A07-E-129 6명 판 광대 봇이 피고일 때 나감 → 재판 결과 없이 시민 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    const [joker, watcher] = t.bots;
    await k.toTribunal(t, uid(joker));
    await k.leave(t, joker);
    await expectWinner(page, 'CITIZEN');
    expect((await t.state()).winResult?.winner).toBe('CITIZEN');
    // 재판 판결 알림은 한 번도 안 옴
    expect(n.eventsOf(watcher, 'tribunal_vote_resolved')).toHaveLength(0);
});

test('A07-E-130 7명 판 처형된 봇이 나가도 판 계속 → 결과 화면 안 뜸, 다음 낮으로 감 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const executed = t.bots[1];
    const night1 = await k.execute(t, uid(executed));
    expect(night1.phase).toBe('NIGHT');
    await k.leave(t, executed);
    const after = await k.expectStillPlaying(t, page);
    expect(after.phase).toBe('NIGHT');
    // 밤을 넘겨도 그대로 둘째 낮
    const day2 = await t.advanceUntil((s) => s.phase !== 'NIGHT');
    expect({ phase: day2.phase, day: day2.dayIndex }).toEqual({ phase: 'DAY', day: 2 });
    await k.expectStillPlaying(t, page);
});

test('A07-E-131 5명 판 시민 0명(광대1·의사2·경비원1·마녀사냥꾼1): 광대 처형 → 시민 진영 승리, 결과판 의사 2줄 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'DOCTOR', ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
    await k.execute(t, uid(t.bots[0]));
    await expectWinner(page, 'CITIZEN');
    const withJob = (role) => k.rows(page).filter({ has: page.getByText(k.JOB_TEXT[role], { exact: true }) });
    // 의사 줄은 "의사" 2줄 (결정: 의사로 통일), 시민이 없는 판이라 "귀족" 줄은 0
    await expect(withJob('DOCTOR')).toHaveCount(2);
    await expect(withJob('CITIZEN')).toHaveCount(0);
});

test('A07-E-132 5명 판 광대 2명: 밤 하나(암살)로 2:2 → 낮 시작 연출 뒤 광대 진영 승리 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(2)]);
    const [j1, j2, victim] = t.bots;
    // 첫날은 아무도 안 찍어 재판 없이 밤
    const end = await k.nightKill(t, [j1, j2], uid(victim));
    expect({ phase: end.phase, winner: end.winResult?.winner ?? null }).toEqual({ phase: 'ENDED', winner: 'JOKER' });
    await expectWinner(page, 'JOKER');
    await expectDawnKill(page, victim);
});
