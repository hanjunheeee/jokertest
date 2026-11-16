'use strict';

// 모바일 재판 중 피고가 빠지는 시험: 피고 봇이 스스로 나가면 그 사람 사망·밤, 끊긴 봇이 피고로 뽑히면 재판 없이 밤, 재판 도중 끊긴 피고가 60초 탈락하면 그 사람 사망·밤
// 목록 A04-E-103·107·110 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫) — 사용자 결정(2026-11-16 오전 끊긴 피고, 낮 스스로 나간 피고)대로 씀: "재판 취소"가 아니라 피고 사망
const { test, expect } = require('../../helpers/fixtures');
const { talk } = require('./_talk');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 재판이 처형 없이 끝나 밤이 됨: 재판 창 닫힘·추방 연출 없음·단계 줄 밤
async function expectNightWithoutExpulsion(page, t, nickname) {
    await expect(trial.win(page)).toBeHidden({ timeout: 10000 });
    await expect(trial.phaseLine(page)).toContainText('밤', { timeout: 10000 });
    await expect(trial.expulsion(page)).toHaveCount(0);
    await expect(page.getByText(trial.expelText(nickname))).toHaveCount(0);
    expect((await t.state()).phase).toBe('NIGHT');
}

// 피고가 죽은 것으로 처리됨: 서버 생사·초상 띠 사망 표시·채팅방 "○○님이 죽었습니다" 줄 (재판이 닫혀 채팅방이 다시 보인 뒤)
async function expectDefendantDead(page, t, d) {
    expect((await t.player(A.uuidOf(d))).alive).toBe(false);
    await expect(trial.seat(page, d.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 10000 });
    await expect(talk.system(page).filter({ hasText: `${d.nickname}님이 죽었습니다` })).toBeVisible({ timeout: 10000 });
}

test('A04-E-103 재판 중 피고 봇이 스스로 판에서 나가면 재판 창이 닫히고 추방 글 없이 밤, 그 사람은 사망 (모바일 8명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 7 });
    const reply = await d.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok).toBe(true);
    // 결정: 스스로 나간 피고도 "재판 취소"가 아니라 그 사람이 죽은 것으로 처리하고 밤 (추방 연출 없음)
    await expectNightWithoutExpulsion(page, t, d.nickname);
    await expectDefendantDead(page, t, d);
});

test('A04-E-107 이미 끊긴 봇이 낮 투표 최다 득표면 재판을 열지 않고 밤, 누가 뽑혔는지 안 알림 (모바일 7명) @game', async ({ user, table }) => {
    const page = user.page;
    const t = await A.openTable(table, { humans: [user], bots: 6, roles: A.plainRoles() });
    await A.toVote(t, 1);
    const d = t.bots[5];
    // 피고가 될 봇이 뽑히기 전에 끊김 → 내 화면 초상 띠에 끊김 표시
    d.socket.disconnect();
    await expect(talk.slot(page, d.nickname)).toHaveAccessibleName(/연결 끊김/, { timeout: 10000 });
    const since = Date.now();
    await A.botsDayVote(t, A.uuidOf(d), t.bots.slice(0, 5));
    await t.advance();
    // 결정: 피고로 뽑히는 순간 이미 끊겨 있으면 재판을 안 열고 밤 (그 사람은 산 채, 누가 뽑혔는지는 알림에 안 실림)
    const s = await A.waitState(t, (g) => g.phase !== 'DAY', { message: '낮 판정 기다림' });
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
    const resolved = await t.bots[0].waitForEvent('day_vote_resolved', { since, timeoutMs: 10000 });
    expect(resolved.outcome).toBe('DEFENDANT_DISCONNECTED');
    expect(resolved.tribunalTargetUuid).toBeNull();
    await expect(trial.phaseLine(page)).toContainText('밤', { timeout: 10000 });
    await expect(trial.win(page)).toHaveCount(0);
    await expect(trial.expulsion(page)).toHaveCount(0);
});

test('A04-E-110 재판 도중 끊긴 피고 봇이 60초 탈락하면 재판 창이 닫히고 그 사람 사망·밤 (모바일 6명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5 });
    d.socket.disconnect();
    await expect(talk.slot(page, d.nickname)).toHaveAccessibleName(/연결 끊김/, { timeout: 10000 });
    // 60초 규칙 자체를 보는 시험이 아니라 손잡이로 끊김 기다림을 끝냄
    const expired = await t.expireGraces();
    expect(expired.fired).toContain(A.uuidOf(d));
    // 결정: 재판 도중 끊겨 탈락하면 그 사람이 죽은 것으로 처리하고 밤 (추방 연출 없음)
    await expectNightWithoutExpulsion(page, t, d.nickname);
    await expectDefendantDead(page, t, d);
});
