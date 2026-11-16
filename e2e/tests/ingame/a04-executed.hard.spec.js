'use strict';

// 사람이 처형되는 어려운 시험: 처형된 사람은 관전·다른 사람은 추방 글, 마지막 광대(사람) 처형 → 세 화면 시민 승, 광대 둘 중 하나 처형 뒤 남은 광대 혼자 밤 차례, 처형된 사람이 떠난 뒤 옛 판 알림이 안 옴
// 목록 A04-H-016·017·018·035·036 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect, e2e } = require('../../helpers/fixtures');
const { hostGame } = require('../room/roomHelpers');
const A = require('./_a04-multi');
const N = require('./b-night/_night');

const { trial } = A;

// 판 진행 알림 이름 (판을 떠난 사람 화면엔 하나도 오면 안 됨)
const GAME_EVENTS = ['day_vote_resolved', 'tribunal_vote_resolved', 'phase_settle_started', 'night_turn_started', 'player_eliminated'];

// 첫 사람(A)이 피고, 봇이 모두 유죄 → A 처형 (다른 사람은 안 눌러도 됨)
async function executeFirstHuman(table, { humans, bots, settings, roles }) {
    const { t } = await A.startTrial(table, { humans, bots, settings, roles, pick: () => humans[0] });
    await A.botsTribunal(t, 'GUILTY', t.bots);
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(humans[0])).alive).toBe(false);
    return { t, s };
}

// 옛 판을 2일 재판 판정까지 돌림 (봇 표만으로)
async function runSecondDayTrial(t) {
    await A.toVote(t, 2);
    await A.toTribunal(t, t.bots[t.bots.length - 1]);
    return A.endTribunal(t);
}

test('A04-H-016 사람 피고 처형: 그 사람은 관전, 다른 사람은 추방 글, 탭을 닫고 로비로 가면 새 방을 만들 수 있음 (사람 2 + 봇 5 = 7명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const nickname = user.account.nickname;
    await executeFirstHuman(table, { humans: [user, b], bots: 5 });
    await A.expectExpelReadable(b.page, nickname);
    // 처형된 사람: 연출 뒤 사망 후 선택 → 관전 계속하기 → 판 화면에 남아 죽은 사람으로 봄
    await A.keepWatching(user.page);
    await expect(user.page).toHaveURL(/\/ingame/);
    await expect(trial.seat(user.page, nickname)).toHaveAttribute('data-ingame-player-status', 'dead');
    await expect(user.page.getByText('죽은 사람끼리', { exact: true })).toBeVisible({ timeout: 15000 });
    // 탭을 닫고 새 탭으로 로비 → 바로 새 방
    await user.page.close();
    const page = await user.context.newPage();
    const room = await A.createRoomFromLobby({ page, account: user.account });
    expect(room.hostUuid).toBe(user.account.uuid);
});

test('A04-H-017 마지막 광대(사람) 처형 → 세 화면 모두 추방 연출 뒤 결과 화면 시민 승 (사람 3 + 봇 5 = 8명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add(), await players.add()];
    // 하나뿐인 광대가 첫 사람
    const roles = ({ humans }) => Object.fromEntries(humans.map((h, i) => [A.uuidOf(h), i === 0 ? 'JOKER' : 'CITIZEN']));
    const { s } = await executeFirstHuman(table, { humans: people, bots: 5, roles });
    expect(s.phase).toBe('ENDED');
    // 추방 연출이 먼저 뜨고 그동안은 판 화면 주소 그대로
    await Promise.all(people.map(async (p) => {
        await expect(trial.expulsion(p.page)).toBeVisible({ timeout: 15000 });
        await expect(p.page).toHaveURL(/\/ingame/);
    }));
    await Promise.all(people.map((p) => A.expectResult(p.page, A.TEXT.citizenWin)));
});

test('A04-H-018 광대 둘 중 하나(사람) 처형 → 밤에 남은 광대(사람) 혼자 대상을 고르고 그대로 적용 (사람 2 광대 + 봇 6 = 8명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const roles = ({ humans }) => Object.fromEntries(humans.map((h) => [A.uuidOf(h), 'JOKER']));
    const { t, s } = await executeFirstHuman(table, { humans: [user, b], bots: 6, settings: { jokerCount: 2 }, roles });
    // 광대 1 : 나머지 6 → 판은 밤으로 이어짐
    expect(s.phase).toBe('NIGHT');
    await A.calm(b.page, () => expect(trial.expulsion(b.page)).toHaveCount(0, { timeout: 500 }), { timeout: 40000 });
    await t.advanceUntil((g) => g.phase === 'NIGHT' && g.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
    // 남은 광대 화면에서 암살 대상을 고름 (죽은 광대는 못 냄)
    const target = t.bots[5];
    await N.nightActUi(b.page, target.nickname, N.ACTION_LABELS.JOKER);
    await t.advanceUntil((g) => g.phase === 'DAY' && g.dayIndex === 2, { stepDelayMs: 500 });
    expect((await t.player(A.uuidOf(target))).alive).toBe(false);
});

test('A04-H-035 처형된 사람이 판에서 나가 로비에서 새 방을 만든 뒤엔 옛 판 밤·낮·재판 알림이 안 옴 (사람 2 + 봇 4 = 6명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const log = A.socketLog(user.page);
    const { t } = await executeFirstHuman(table, { humans: [user, b], bots: 4 });
    await A.leaveFromDeadChoice(user.page);
    const leftAt = Date.now();
    const room = await A.createRoomFromLobby(user);
    // 옛 판은 계속: 밤 → 2일 낮 → 2일 재판 판정
    await runSecondDayTrial(t);
    await expect(trial.win(b.page)).toBeHidden({ timeout: 10000 });
    // 떠난 사람 화면: 옛 판 알림 0개, 새 방 대기방 그대로
    const got = log.events.filter((e) => e.at >= leftAt && (GAME_EVENTS.includes(e.event) || e.payload?.gameId === t.gameId));
    expect(got.map((e) => e.event)).toEqual([]);
    await expect(user.page).toHaveURL(/\/game-matching/);
    expect((await e2e.roomOf(user.account.uuid))?.roomId).toBe(room.roomId);
});

test('A04-H-036 처형된 사람이 새 방에서 새 판을 시작하면 옛 판 재판 알림이 새 판 화면에 안 옴 (사람 2 + 봇 4, 새 판 사람 1 + 봇 4 = 5명) @game @hard', async ({ user, players, table, bots }) => {
    test.setTimeout(360_000);
    const b = await players.add();
    const log = A.socketLog(user.page);
    const { t } = await executeFirstHuman(table, { humans: [user, b], bots: 4 });
    await A.leaveFromDeadChoice(user.page);
    // 새 방(사람이 방장) + 새 봇 4 = 5명 판 시작
    const newBots = await bots.spawn(4);
    const roles = { [user.account.uuid]: 'CITIZEN', [A.uuidOf(newBots[0])]: 'JOKER' };
    const next = await hostGame({ host: user, botList: newBots, roles, settings: { maxPlayers: 5 } });
    await A.afterStart(next, roles);
    expect(next.gameId).not.toBe(t.gameId);
    const startedAt = Date.now();
    // 옛 판 2일 재판 (새 판은 아직 1일 낮 토론이라 재판 알림이 올 일이 없음)
    await runSecondDayTrial(t);
    await expect(trial.win(b.page)).toBeHidden({ timeout: 10000 });
    const got = log.events.filter((e) => e.at >= startedAt
        && (['day_vote_resolved', 'tribunal_vote_resolved', 'phase_settle_started'].includes(e.event) || e.payload?.gameId === t.gameId));
    expect(got.map((e) => e.event)).toEqual([]);
    // 새 판 화면 그대로: 옛 판 재판 창이 안 뜨고 서버도 새 판에만 묶여 있음
    await expect(user.page).toHaveURL(/\/ingame/);
    await expect(trial.win(user.page)).toHaveCount(0);
    expect((await e2e.gameOf(user.account.uuid))?.gameId).toBe(next.gameId);
});
