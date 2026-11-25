'use strict';

// 재판 "다 누르면 5초 뒤 판정" 브라우저 시험 (PC, 진짜 시간): "[5초 뒤 마감]" 글, 5초(±1.5초) 뒤 창 닫힘, 남은 시간이 짧으면 원래 마감, 끊긴 봇·나간 봇·새로고침·2일 재판
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-023~028·031~036·100·170 — 손잡이로 재판을 넘기지 않음(그 5초를 건너뜀)
const { test, expect, ui } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;
// 진짜 시간 허용 폭 (시험_계획 3-5)
const SLACK_MS = 1500;
const SETTLE_MS = 5000;

// 재판 단계 마감 당김 알림(그 뒤에 온 것)을 봇이 받았는지
const settleEvents = (bot, since) => bot.events.filter((r) => r.event === 'phase_settle_started' && r.at >= since && r.payload?.phase === 'TRIBUNAL');

// n명 판(사람 시민, 첫 봇 광대)을 1일 재판까지, 화면 기록도 검 → 피고는 셋째 봇(시민), voters = 표 낼 봇
async function toTribunal(table, user, n, tribunalTime) {
    const t = await K.seat(table, user, { n, settings: { tribunalTime } });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.watchScreen(user.page);
    const { deadline } = await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, deadline, page: user.page, voters: t.bots.filter((b) => b !== defendant) };
}

// 당겨진 뒤: 서버가 알린 새 마감 = 마지막 표 + 5초, 화면 "[5초 뒤 마감]", 그 시각(±1.5초)에 재판 창 닫힘
async function expectSettledClose({ page, watcher, since, votedAt }) {
    const settle = await watcher.waitForEvent('phase_settle_started', { match: (p) => p?.phase === 'TRIBUNAL', since, timeoutMs: 4000 });
    expect(Math.abs(settle.deadline - (votedAt + SETTLE_MS))).toBeLessThanOrEqual(SLACK_MS);
    await K.expectSettleShown(page);
    await expect(K.tribunal(page)).toBeHidden({ timeout: SETTLE_MS + 3000 });
    const rec = await K.readScreen(page);
    const closedAt = rec.closed.at(-1);
    expect(rec.settle.length).toBeGreaterThan(0);
    expect(Math.abs(closedAt - settle.deadline)).toBeLessThanOrEqual(SLACK_MS);
    expect(closedAt - votedAt).toBeGreaterThanOrEqual(SETTLE_MS - SLACK_MS);
    return { settle, closedAt };
}

[[23, 5], [24, 6], [25, 7], [26, 8], [27, 9], [28, 10]].forEach(([no, n], i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`A04-E-0${no} PC ${n}명 판 재판 120초, 사람·봇 다 냄 → "[5초 뒤 마감]"이 읽히고 5초(±1.5초) 뒤 재판 창 닫힘 @game @realtime${smoke}`, async ({ user, table }) => {
        const { t, deadline, page, voters } = await toTribunal(table, user, n, 120);
        await K.press(page, TEXT.GUILTY);
        const since = Date.now();
        await K.botsVerdict(t, 'NOT_GUILTY', voters);
        const votedAt = Date.now();
        const { closedAt } = await expectSettledClose({ page, watcher: voters[0], since, votedAt });
        // 원래 마감(120초)을 기다린 게 아님
        expect(closedAt).toBeLessThan(deadline - 60_000);
        expect((await t.state()).phase).toBe('NIGHT');
    });
});

[[31, 7000], [32, 6000]].forEach(([no, remainMs]) => {
    test(`A04-E-0${no} PC 6명 판 재판 15초, 남은 ${remainMs / 1000}초에 다 참 → 5초 뒤 판정(원래 마감보다 앞) @game @realtime`, async ({ user, table }) => {
        const { t, deadline, page, voters } = await toTribunal(table, user, 6, 15);
        await K.press(page, TEXT.GUILTY);
        await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(0, -1));
        // 마지막 표는 남은 시간이 딱 그만큼일 때 (진짜로 기다림)
        await K.sleepUntil(deadline - remainMs);
        expect(Date.now() - (deadline - remainMs), '준비가 늦어 남은 시간을 못 맞춤').toBeLessThan(400);
        const since = Date.now();
        expect((await K.botVerdict(t, voters.at(-1), 'NOT_GUILTY', 1)).ok).toBe(true);
        const votedAt = Date.now();
        const { settle, closedAt } = await expectSettledClose({ page, watcher: voters[0], since, votedAt });
        expect(settle.deadline).toBeLessThan(deadline);
        expect(closedAt).toBeLessThan(deadline);
    });
});

[[33, 4000], [34, 2000]].forEach(([no, remainMs]) => {
    test(`A04-E-0${no} PC 7명 판 재판 15초, 남은 ${remainMs / 1000}초에 다 참 → "[5초 뒤 마감]" 없이 원래 마감에 판정 @game @realtime`, async ({ user, table }) => {
        const { t, deadline, page, voters } = await toTribunal(table, user, 7, 15);
        const startedAt = deadline - 15_000;
        await K.press(page, TEXT.GUILTY);
        await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(0, -1));
        await K.sleepUntil(deadline - remainMs);
        expect(Date.now() - (deadline - remainMs), '준비가 늦어 남은 시간을 못 맞춤').toBeLessThan(400);
        expect((await K.botVerdict(t, voters.at(-1), 'NOT_GUILTY', 1)).ok).toBe(true);
        await expect(K.tribunal(page)).toBeHidden({ timeout: remainMs + 3000 });
        const rec = await K.readScreen(page);
        // 5초로 다시 늘어났다면 원래 마감보다 1초·3초 늦게 닫힘 → 원래 마감 바로 뒤에 닫혀야 함
        const late = rec.closed.at(-1) - deadline;
        expect(late).toBeGreaterThanOrEqual(-300);
        expect(late).toBeLessThanOrEqual(700);
        expect(rec.settle).toHaveLength(0);
        expect(settleEvents(voters[0], startedAt)).toHaveLength(0);
    });
});

test('A04-E-035 PC 8명 판 재판 15초, 봇 1명 끊김·나머지 다 냄 → 안 당겨지고 15초 끝에 판정 @game @realtime', async ({ user, table }) => {
    const { t, deadline, page, voters } = await toTribunal(table, user, 8, 15);
    const startedAt = deadline - 15_000;
    // 끊긴 봇은 60초 동안 판에 남아 "안 낸 사람"으로 셈
    const gone = voters.at(-1);
    gone.socket.disconnect();
    await K.press(page, TEXT.GUILTY);
    await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(0, -1));
    await expect(K.tribunal(page)).toBeHidden({ timeout: 18_000 });
    const rec = await K.readScreen(page);
    expect(Math.abs(rec.closed.at(-1) - deadline)).toBeLessThanOrEqual(SLACK_MS);
    expect(rec.settle).toHaveLength(0);
    expect(settleEvents(voters[0], startedAt)).toHaveLength(0);
    expect((await t.state()).phase).toBe('NIGHT');
});

test('A04-E-036 PC 6명 판 재판 120초, 안 낸 봇이 나가서 다 참 → "[5초 뒤 마감]", 5초 뒤 판정 @game @realtime', async ({ user, table }) => {
    const { t, deadline, page, voters } = await toTribunal(table, user, 6, 120);
    // 나갈 봇: 방장·광대가 아닌 시민 (나가도 판이 안 끝남)
    const leaver = voters.find((b) => b !== K.hostBot(t) && b !== t.bots[0]);
    await K.press(page, TEXT.GUILTY);
    await K.botsVerdict(t, 'NOT_GUILTY', voters.filter((b) => b !== leaver));
    expect(await K.readScreen(page).then((rec) => rec.settle)).toHaveLength(0);
    const since = Date.now();
    expect((await leaver.request('leave_game_session', { gameId: t.gameId }))?.ok).toBe(true);
    const votedAt = Date.now();
    const watcher = voters.find((b) => b !== leaver);
    const { closedAt } = await expectSettledClose({ page, watcher, since, votedAt });
    expect(closedAt).toBeLessThan(deadline - 60_000);
});

test('A04-E-100 PC 7명 판 재판 120초, 다 찬 지 1초 뒤 새로고침 → 시간 바가 펼쳐진 채 "[5초 뒤 마감]"·남은 시간 5초 이하, 당겨진 그 시각에 판정 @game @realtime', async ({ user, table }) => {
    const { t, page, voters } = await toTribunal(table, user, 7, 120);
    await K.press(page, TEXT.GUILTY);
    const since = Date.now();
    await K.botsVerdict(t, 'NOT_GUILTY', voters);
    const settle = await voters[0].waitForEvent('phase_settle_started', { match: (p) => p?.phase === 'TRIBUNAL', since, timeoutMs: 4000 });
    await K.sleepUntil(settle.deadline - SETTLE_MS + 1000);
    await page.reload();
    await K.expectTribunal(page);
    await K.calm(page);
    // 재판 연출 중엔 시간 바 위에 명패+타이머 판이 늘 보임 (합친 뒤 시간 바엔 확대·접기 단추가 아예 없음)
    const bar = K.timebar(page);
    await expect(bar.locator('[data-ingame-phase-timer="timebar-embedded"]')).toBeVisible({ timeout: 2000 });
    await expect(bar.getByRole('button', { name: /^시간흐름바 (확대|접기)$/ })).toHaveCount(0);
    // 당김 표시도 새로고침 뒤 살아 있음: "[5초 뒤 마감]" 글 + 남은 시간 5초 이하 (남은 몇 초 안에 다 봐야 해서 글은 보이는지만 봄)
    await expect(bar.getByText(TEXT.SETTLE, { exact: true })).toBeVisible({ timeout: 2000 });
    await expect(K.barTimer(page)).toHaveText(/^00:0[0-5]$/, { timeout: 2000 });
    await expect(K.tribunal(page)).toBeHidden({ timeout: SETTLE_MS + 3000 });
    expect(Math.abs(Date.now() - settle.deadline)).toBeLessThanOrEqual(SLACK_MS);
    expect((await t.state()).phase).toBe('NIGHT');
});

test('A04-E-170 PC 8명 판 1일 처형된 봇이 끊김, 2일 재판 산 사람 다 냄 → 5초 뒤 판정 (처형·끊긴 사람은 셈 밖) @game @realtime', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8, settings: { tribunalTime: 120 } });
    const [executed, second] = [t.bots[2], t.bots[3]];
    const page = user.page;
    await K.toFirstDay(t);
    // 1일: 봇 표로 처형 (이 재판은 5초 규칙을 안 봐서 손잡이로 마감)
    await K.openTribunal(t, uuidOf(executed));
    await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => b !== executed));
    const night1 = await K.closeTribunal(t);
    expect(night1.players.find((p) => p.uuid === uuidOf(executed)).alive).toBe(false);
    executed.socket.disconnect();
    await K.passExpulsion(page);
    await K.toDayOf(t, 2);
    // 1일 밤엔 아무도 안 죽음 → "지난밤 아무 일도 일어나지 않았습니다" 창을 확인으로 닫음 (안 닫으면 재판 단추를 덮음)
    await ui.confirmQuietDawn(page);
    // 2일: 산 사람(나 + 산 봇, 피고 빼고)이 다 냄
    await K.watchScreen(page);
    const { deadline } = await K.openTribunal(t, uuidOf(second));
    await K.expectTribunal(page, second.nickname);
    const voters = t.bots.filter((b) => b !== executed && b !== second);
    await K.press(page, TEXT.GUILTY);
    const since = Date.now();
    await K.botsVerdict(t, 'NOT_GUILTY', voters);
    const votedAt = Date.now();
    const { closedAt } = await expectSettledClose({ page, watcher: voters[0], since, votedAt });
    expect(closedAt).toBeLessThan(deadline - 60_000);
});
