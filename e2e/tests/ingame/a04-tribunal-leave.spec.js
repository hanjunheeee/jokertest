'use strict';

// 재판 중 나가기·끊김 브라우저 시험 (PC): 피고 봇이 나가면 피고 사망·밤, 투표자·방장 봇이 나가도 재판 그대로, 끊긴 피고(결정 2026-11-16 오전·낮)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-102·104·105·106·108·109
// 피고가 빠지는 줄(102·106·108·109)은 결정대로 씀: 뽑히는 순간 이미 끊겨 있으면 재판을 안 열고 밤(누가 뽑혔는지 안 알림)
// 재판 도중 스스로 나가거나 끊겨 60초 뒤 탈락하면 "재판 취소"가 아니라 그 사람 사망으로 처리·밤 (서버 값 DEFENDANT_DIED)
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { uuidOf } = K;

const leave = (t, bot) => bot.request('leave_game_session', { gameId: t.gameId });

// n명 판(사람 시민)을 1일 재판까지, 화면 기록도 검 → 피고는 defendantIndex번 봇
async function toTribunal(table, user, n, { bots = ['JOKER'], defendantIndex = 2 } = {}) {
    const t = await K.seat(table, user, { n, bots });
    const defendant = t.bots[defendantIndex];
    await K.toFirstDay(t);
    await K.watchScreen(user.page);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, page: user.page, voters: t.bots.filter((b) => b !== defendant) };
}

// 재판이 판정 없이 닫힘(피고 사망): 창 닫힘, 추방 연출 한 번도 없음, 밤 안내, 피고는 서버·판 카드 다 사망
async function expectDefendantDied(t, page, defendant) {
    await expect(K.tribunal(page)).toBeHidden({ timeout: 15000 });
    await K.expectNightNotice(page);
    expect((await K.readScreen(page)).expulsions).toHaveLength(0);
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(s.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
    await K.night.expectCard(page, defendant.nickname, 'dead');
}

// 봇이 받은 재판 결과 알림: 처형(GUILTY)·취소(CANCELLED)가 아니라 피고 사망, 처형된 사람 없음
async function expectDiedBroadcast(bot, since) {
    const resolved = await bot.waitForEvent('tribunal_vote_resolved', { since, timeoutMs: 10000 });
    expect(resolved.outcome).toBe('DEFENDANT_DIED');
    expect(resolved.phase).toBe('NIGHT');
    expect(resolved.executedUuid).toBeNull();
}

test('A04-E-102 PC 6명 판 재판 중 피고 봇이 스스로 나감 → (결정) 그 사람 사망으로 처리, 재판 창 닫히고 추방 글 없이 밤 @game @smoke', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 6);
    const since = Date.now();
    expect((await leave(t, defendant))?.ok).toBe(true);
    await expectDiedBroadcast(voters[0], since);
    await expectDefendantDied(t, page, defendant);
});

test('A04-E-104 PC 7명 판 재판 중 투표자 봇이 나감 → 재판 창·단추 그대로 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 7);
    // 나갈 봇: 방장·광대가 아닌 시민
    const leaver = voters.find((b) => b !== K.hostBot(t) && b !== t.bots[0]);
    expect((await leave(t, leaver))?.ok).toBe(true);
    await expect.poll(async () => (await t.player(uuidOf(leaver)))?.isParticipating, { message: '나간 봇이 판에서 빠짐' }).not.toBe(true);
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(s.tribunal.defendantUuid).toBe(uuidOf(defendant));
    await expect(K.tribunal(page)).toBeVisible();
    await K.expectVoteButtons(page);
});

test('A04-E-105 PC 8명 판 재판 중 방장 봇이 나감 → 재판 그대로 @game', async ({ user, table }) => {
    // 방장(첫 봇)을 시민으로 둠 — 광대가 나가면 판이 끝나 버림
    const { t, defendant, page } = await toTribunal(table, user, 8, { bots: ['CITIZEN', 'JOKER'] });
    const host = K.hostBot(t);
    expect(host).not.toBe(defendant);
    expect((await t.player(uuidOf(host))).role).toBe('CITIZEN');
    expect((await leave(t, host))?.ok).toBe(true);
    await expect.poll(async () => (await t.player(uuidOf(host)))?.isParticipating, { message: '방장 봇이 판에서 빠짐' }).not.toBe(true);
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(s.tribunal.defendantUuid).toBe(uuidOf(defendant));
    await expect(K.tribunal(page)).toBeVisible();
    await K.expectVoteButtons(page);
});

test('A04-E-106 PC 6명 판 이미 끊긴 봇이 낮 투표 최다 득표 → (결정) 재판을 안 열고 밤(누가 뽑혔는지 안 알림), 추방 글 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    const gone = t.bots[2];
    await K.toFirstDay(t);
    await K.watchScreen(page);
    await K.toVote(t);
    // 뽑히기 전에 끊김 (60초 기다리는 동안이라 판에는 산 채로 남음)
    gone.socket.disconnect();
    // 서버가 끊김을 알아챈 뒤에 뽑혀야 이 규칙을 봄 → 내 화면 카드가 끊김 표시로 바뀔 때까지
    await K.night.expectCard(page, gone.nickname, 'disconnected');
    const since = Date.now();
    await K.day.botsVote(t, uuidOf(gone), t.bots.filter((b) => b !== gone));
    await t.advance();
    const after = await K.day.waitState(t, (g) => g.phase !== 'DAY');
    expect(after.phase).toBe('NIGHT');
    expect(after.players.find((p) => p.uuid === uuidOf(gone)).alive).toBe(true);
    // 낮 판정 알림: 끊긴 피고라 재판 없음, 누가 뽑혔는지는 안 실림
    const resolved = await t.bots[0].waitForEvent('day_vote_resolved', { since, timeoutMs: 10000 });
    expect(resolved.outcome).toBe('DEFENDANT_DISCONNECTED');
    expect(resolved.tribunalTargetUuid).toBeNull();
    await K.expectNightNotice(page);
    const rec = await K.readScreen(page);
    expect(rec.expulsions).toHaveLength(0);
    await expect(K.tribunal(page)).toBeHidden();
});

test('A04-E-108 PC 8명 판 재판 도중 끊긴 피고 봇(60초 안) 유죄 → 추방 글 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 8);
    defendant.socket.disconnect();
    await K.botsVerdict(t, 'GUILTY', voters);
    const after = await K.closeTribunal(t);
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
    await K.expectExpelled(page, defendant.nickname);
});

test('A04-E-109 PC 7명 판 재판 도중 끊긴 피고 봇이 60초 뒤 탈락(손잡이) → (결정) 그 사람 사망으로 처리, 재판 창 닫히고 밤 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 7);
    const since = Date.now();
    defendant.socket.disconnect();
    // 서버가 끊김을 알아챈 뒤라야 60초 시계가 걸림 → 손잡이가 그 사람 시계를 돌릴 때까지
    await expect.poll(async () => (await t.expireGraces()).fired, { message: '끊긴 피고 60초 끝내기' }).toContain(uuidOf(defendant));
    await expectDiedBroadcast(voters[0], since);
    await expectDefendantDied(t, page, defendant);
});
