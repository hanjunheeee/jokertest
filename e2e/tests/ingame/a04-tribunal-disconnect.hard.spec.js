'use strict';

// 재판 중 끊김·나가기 어려운 시험: 피고(사람)가 59초 안에 돌아옴·61초 탈락·스스로 나감, 투표자 새로고침·탭 닫힘·61초 탈락 뒤 5초 당김, 끊긴 피고가 처형된 뒤 돌아옴
// 목록 A04-H-010~015·033 (시험목록/A04-재판.md "브라우저 — 어려움") — 60초는 손잡이 없이 진짜로 기다림
// 끊겨 탈락한 피고·스스로 나간 피고는 사용자 결정(2026-11-16 오전·낮)대로: "재판 취소"가 아니라 그 사람 사망으로 처리하고 밤
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');

const { trial } = A;
const GRACE_MS = 60_000;

// 다른 사람 화면에서 그 사람 판 카드 상태 (alive·dead·disconnected)
const expectSeat = (page, person, status, timeout = 10000) => expect(trial.seat(page, A.nickOf(person)))
    .toHaveAttribute('data-ingame-player-status', status, { timeout });

// 재판이 처형 없이 닫혀 밤(피고 사망): 재판 창 닫힘·추방 연출 없음·밤 안내
async function expectNightWithoutExpulsion(page) {
    await expect(trial.win(page)).toBeHidden({ timeout: 10000 });
    await expect(trial.nightNotice(page)).toBeVisible({ timeout: 10000 });
    await expect(trial.expulsion(page)).toHaveCount(0);
}

test('A04-H-010 피고(사람)가 탭을 닫았다 59초 안에 돌아오면 재판 그대로 (사람 2 + 봇 4 = 6명, 재판 120초) @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const { t } = await A.startTrial(table, { humans: [user, b], bots: 4, pick: () => user });
    await A.expectNoticeReadable(trial.defendantNotice(user.page));
    const cutAt = Date.now();
    await user.page.close();
    await expectSeat(b.page, user, 'disconnected');
    // 손잡이 없이 기다림: 끊긴 지 56초에 새 탭을 열기 시작 (화면이 뜨고 소켓이 붙는 몇 초까지 59초 안)
    await A.sleepUntil(cutAt + 56_000);
    await expect(trial.win(b.page)).toBeVisible();
    const page = await A.reopen(user);
    await expect(trial.win(page)).toBeVisible({ timeout: 4000 });
    expect(Date.now() - cutAt, '60초 안에 돌아와야 이 규칙을 봄 (넘었으면 시험 쪽이 늦은 것)').toBeLessThan(GRACE_MS);
    await A.expectNoticeReadable(trial.defendantNotice(page));
    // 60초가 지나도 탈락 없이 두 화면 다 재판 그대로
    await A.sleepUntil(cutAt + GRACE_MS + 2000);
    await expect(trial.win(page)).toBeVisible();
    await expect(trial.win(b.page)).toBeVisible();
    await expect(trial.button(b.page, 'GUILTY')).toBeEnabled();
    await expectSeat(b.page, user, 'alive');
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(A.playerOf(s, user.account.uuid).alive).toBe(true);
});

test('A04-H-011 피고(사람)가 끊긴 채 61초가 되면 다른 사람 화면은 재판 창이 닫히고 추방 글 없이 밤, 그 사람은 사망 (사람 2 + 봇 5 = 7명, 재판 120초) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const { t } = await A.startTrial(table, { humans: [user, b], bots: 5, pick: () => user });
    const cutAt = Date.now();
    await user.page.close();
    await expectSeat(b.page, user, 'disconnected');
    // 손잡이 없이 기다림: 58초엔 아직 재판 중, 60초(±1.5초)에 닫힘
    await A.sleepUntil(cutAt + GRACE_MS - 2000);
    await expect(trial.win(b.page)).toBeVisible();
    const closed = await A.closedAt(b.page, { timeout: 5000 });
    A.expectNear(closed - cutAt, GRACE_MS, '끊긴 지 60초에 재판 창이 닫힘');
    // 결정: 재판 도중 끊겨 탈락하면 그 사람이 죽은 것으로 처리하고 밤 (처형이 아니라 추방 연출 없음)
    await expectNightWithoutExpulsion(b.page);
    await expectSeat(b.page, user, 'dead');
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, user.account.uuid).alive).toBe(false);
});

test('A04-H-012 피고(사람)가 재판 중 스스로 판에서 나가면 나머지 두 화면은 재판 창이 닫히고 추방 글 없이 밤, 그 사람은 사망 (사람 3 + 봇 3 = 6명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const c = await players.add();
    const { t } = await A.startTrial(table, { humans: [user, b, c], bots: 3, pick: () => c });
    await expect(trial.defendantNotice(c.page)).toBeVisible();
    // 재판 중엔 위 줄 "게임 나가기"가 잠겨 있어 뒤로 가기 → 나가기 확인 창으로 나감
    await A.leaveByBack(c.page);
    // 결정: 스스로 나간 피고도 그 사람이 죽은 것으로 처리하고 밤 (처형이 아니라 추방 연출 없음)
    for (const p of [user, b]) {
        await expectNightWithoutExpulsion(p.page);
        await expectSeat(p.page, c, 'dead');
    }
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, A.uuidOf(c)).alive).toBe(false);
});

test('A04-H-013 투표자가 새로고침하면 단추가 다시 보이고 누르면 서버가 받음, 다른 사람 화면은 그대로 (사람 2 + 봇 5 = 7명) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const log = A.socketLog(user.page);
    const { t, d } = await A.startTrial(table, { humans: [user, b], bots: 5 });
    await expect(trial.button(b.page, 'GUILTY')).toBeEnabled();
    await user.page.reload();
    await expect(trial.win(user.page)).toBeVisible({ timeout: 20000 });
    await A.expectButtonsReadable(user.page);
    await A.pressVote(user.page, 'GUILTY');
    await A.expectVoteAccepted(log, 'GUILTY', 1);
    // B 화면: 재판 창·단추 그대로, 완료 글 없음, 새로고침한 사람 카드도 산 사람
    await expect(trial.win(b.page)).toBeVisible();
    await expect(trial.button(b.page, 'GUILTY')).toBeEnabled();
    await expect(trial.done(b.page)).toHaveCount(0);
    await expectSeat(b.page, user, 'alive');
    // 새로고침 뒤 낸 유죄 1표뿐 → 처형
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
});

test('A04-H-014 투표자 하나가 탭을 닫으면 나머지가 다 내도 당김 없이 15초 끝에 판정 (사람 3 + 봇 3 = 6명, 재판 15초) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const c = await players.add();
    const { t, d } = await A.startTrial(table, { humans: [user, b, c], bots: 3, settings: { tribunalTime: 15 } });
    const deadline = await A.tribunalDeadline(t);
    const since = Date.now();
    await user.page.close();
    await A.botsTribunal(t, 'GUILTY', await A.votersOf(t, d));
    await trial.button(b.page, 'GUILTY').click();
    await trial.button(c.page, 'GUILTY').click();
    expect(deadline - Date.now(), '남은 시간이 5초보다 넉넉할 때 다 내야 이 규칙을 봄 (모자라면 시험 쪽이 늦은 것)').toBeGreaterThan(5500);
    // 끊긴 사람이 안 냈으니 다 찬 것이 아님 → "5초 뒤 마감" 없이 원래 마감까지
    await A.sleepUntil(deadline - A.TOLERANCE_MS);
    for (const p of [b, c]) {
        await expect(trial.win(p.page)).toBeVisible();
        await A.expectNoSettle(p.page);
    }
    const closed = await Promise.all([b, c].map((p) => A.closedAt(p.page, { timeout: 5000 })));
    for (const at of closed) A.expectNear(at, deadline, '원래 15초 마감에 재판 창이 닫힘');
    expect(t.bots[0].events.filter((e) => e.event === 'phase_settle_started' && e.at >= since)).toHaveLength(0);
});

test('A04-H-015 끊긴 투표자가 61초에 탈락하면 남은 사람이 다 냈으니 그때 "[5초 뒤 마감]" (사람 2 + 봇 6 = 8명, 재판 120초) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const { t, d } = await A.startTrial(table, { humans: [user, b], bots: 6 });
    const bot = t.bots[0];
    const cutAt = Date.now();
    await user.page.close();
    await expectSeat(b.page, user, 'disconnected');
    await A.botsTribunal(t, 'GUILTY', await A.votersOf(t, d));
    await A.pressVote(b.page, 'GUILTY');
    // 끊긴 사람은 살아 있고 안 냈으니 아직 당김 없음 — 손잡이 없이 60초를 기다림
    await A.sleepUntil(cutAt + GRACE_MS - 2000);
    await expect(trial.win(b.page)).toBeVisible();
    await A.expectNoSettle(b.page);
    await bot.waitForEvent('phase_settle_started', { match: (p) => p.phase === 'TRIBUNAL', timeoutMs: 5000 });
    const pulled = bot.events.findLast((e) => e.event === 'phase_settle_started');
    A.expectNear(pulled.at - cutAt, GRACE_MS, '끊긴 지 60초에 탈락하며 마감 당김');
    await A.expectSettleShown(b.page);
    await expectSeat(b.page, user, 'dead');
    // 당김 5초 뒤 판정
    A.expectNear(pulled.payload.deadline - pulled.at, 5000, '탈락 뒤 판정까지');
    const closed = await A.closedAt(b.page, { timeout: 8000 });
    A.expectNear(closed, pulled.payload.deadline, '당겨진 마감에 재판 창이 닫힘');
});

test('A04-H-033 끊긴 피고(사람)가 30초 안에 처형된 뒤 돌아오면 사망 화면, 탈주 처리 없음 (사람 2 + 봇 5 = 7명, 재판 120초) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const { t } = await A.startTrial(table, { humans: [user, b], bots: 5, pick: () => user });
    const cutAt = Date.now();
    await user.page.close();
    await expectSeat(b.page, user, 'disconnected');
    // 봇 5 + B가 다 유죄 → 손잡이 없이 5초 뒤 처형 (끊긴 지 30초 안)
    await A.botsTribunal(t, 'GUILTY', t.bots);
    const pressedAt = Date.now();
    await trial.button(b.page, 'GUILTY').click();
    const closed = await A.closedAt(b.page, { timeout: 10000 });
    A.expectNear(closed - pressedAt, 5000, '다 누른 뒤 판정까지');
    expect(closed - cutAt).toBeLessThan(30_000);
    await A.expectExpelReadable(b.page, user.account.nickname);
    expect((await t.player(user.account.uuid)).alive).toBe(false);
    // 돌아옴: 사망 후 선택 창 (사망 글 + 탈주가 아니라는 안내)
    const messages = [];
    const page = await user.context.newPage();
    page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.accept().catch(() => {}); });
    await page.goto('/ingame');
    const dead = trial.deadChoice(page);
    await A.calm(page, () => expect(dead).toBeVisible({ timeout: 1000 }), { keepWatching: false, timeout: 45000 });
    await expect(dead).toContainText('당신은 사망했습니다.');
    await expect(dead).toContainText('사망한 뒤라 나가도 탈주가 아니며');
    // 처음 끊긴 때부터 60초가 지나도 탈락·탈주 처리 없음 → 나가서 바로 새 방을 만들 수 있음
    await A.sleepUntil(cutAt + GRACE_MS + 1500);
    await dead.getByRole('button', { name: '게임 나가기' }).click();
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
    const room = await A.createRoomFromLobby({ page, account: user.account });
    expect(room.hostUuid).toBe(user.account.uuid);
    // 뜬 확인·알림 창 어디에도 탈주 벌(패배·입장 제한) 글이 없음
    expect(messages.filter((m) => /패배로 기록|들어갈 수 없습니다/.test(m))).toEqual([]);
});
