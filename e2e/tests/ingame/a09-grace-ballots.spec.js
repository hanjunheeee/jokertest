'use strict';

// 끊긴 봇의 표·밤 차례 브라우저 시험 (PC, 진짜 시간) — 끊긴 채 안 낸 낮 표는 투표 마감(30초)에 기권으로 셈, 끊긴 의사의 밤 차례는 차례 마감(30초)에 건너뜀
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-075·076 — 마감은 손잡이로 안 넘기고 진짜로 기다림 (@realtime), 그 앞 단계만 손잡이
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const night = require('./b-night/_night');
const L = require('./a-day/_lib');
const K = require('./_a09-simple-kit');

// 봇이 받은 알림 한 줄 기다림 (받은 시각 at 포함)
async function eventRow(bot, event, { since, match = () => true, timeout = 15_000 }) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 투표 현황 창 열기 (밤 안내 같은 연출 창이 덮으면 닫고 다시)
async function openStatus(page) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await ui.closeOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

test('A09-E-075 PC 7명 판(토론 30·투표 30), 끊긴 봇은 안 낸 채 투표 마감 30초 → 그 봇 표는 기권으로 셈 @game @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    const [dropped, target] = K.botsOf(t, await t.state(), 'CITIZEN');
    const watcher = target;
    await K.toDay(t);
    await K.clear(page);

    // 토론은 손잡이로 넘김 → 투표 30초가 열린 때
    const since = Date.now();
    await t.advance();
    const open = await eventRow(watcher, 'day_phase_changed', { since, match: (p) => p.dayIndex === 1 && p.dayPhase === 'DAY_VOTE' });
    await expectReadable(page.getByRole('button', { name: '기권' }));

    // 봇 하나가 끊김 (표 안 냄) → 붙어 있는 봇 5: 둘은 target을 찍고 셋은 기권을 냄, 사람은 안 냄
    K.dropBot(dropped);
    await expect(K.cardOf(page, dropped.nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected', { timeout: 15_000 });
    const up = t.bots.filter((b) => b !== dropped);
    const pickers = up.filter((b) => b !== target).slice(0, 2);
    await K.botsVote(t, pickers, K.U(target));
    await K.botsVote(t, up.filter((b) => !pickers.includes(b)), null);

    // 손잡이 없이 투표 마감(30초)까지 기다림
    const resolved = await eventRow(watcher, 'day_vote_resolved', { since: open.at, timeout: 40_000 });
    const tookMs = resolved.at - open.at;
    expect(tookMs, `투표가 열린 뒤 ${tookMs}ms에 판정`).toBeGreaterThanOrEqual(30_000 - K.SLACK_MS);
    expect(tookMs, `투표가 열린 뒤 ${tookMs}ms에 판정`).toBeLessThanOrEqual(30_000 + K.SLACK_MS);

    // 찍힌 표 2 · 기권 5 (기권 낸 봇 3 + 안 낸 나 1 + 끊긴 봇 1) → 재판 없이 밤
    await L.closeNotice(page, '밤이 되었습니다');
    const status = await openStatus(page);
    const abstain = status.getByTestId('vote-status-public-abstain-count');
    await expect(abstain).toHaveText('5');
    await expectReadable(abstain);
    await expect(status.getByTestId('vote-status-outcome')).toHaveText('기권이 많아 재판 없음');
    // 끊긴 봇은 60초 안이라 판에 산 채로 남아 있음
    const row = await t.player(K.U(dropped));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
});

test('A09-E-076 PC 8명 판(밤 30), 끊긴 의사 봇의 차례는 마감 30초에 건너뜀 → 그 밤 보호 없이 광대 대상이 죽음 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8, settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const s0 = await t.state();
    const joker = K.botOf(t, s0, 'JOKER');
    const doctor = K.botOf(t, s0, 'DOCTOR');
    const victim = K.botOf(t, s0, 'CITIZEN');
    await night.recordUi(page);

    // 1일 밤 광대 차례까지 손잡이 → 광대가 시민 봇을 지목, 의사 봇은 끊김
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, K.U(victim)))?.ok, '광대 지목을 서버가 받음').toBe(true);
    const droppedSince = Date.now();
    K.dropBot(doctor);
    const droppedAt = await K.droppedAt(t, K.U(doctor), droppedSince);

    // 의사 차례 시작부터 끝까지는 손잡이 없이 기다림 (광대 차례는 다 골라 5초 뒤 저절로 끝남)
    const started = await eventRow(joker, 'night_turn_started', { since: droppedSince, match: (p) => p.role === 'DOCTOR' && p.dayIndex === 1, timeout: 15_000 });
    const ended = await eventRow(joker, 'night_turn_ended', { since: started.at, match: (p) => p.role === 'DOCTOR' && p.dayIndex === 1, timeout: 40_000 });
    const tookMs = ended.at - started.at;
    expect(tookMs, `의사 차례 ${tookMs}ms`).toBeGreaterThanOrEqual(30_000 - K.SLACK_MS);
    expect(tookMs, `의사 차례 ${tookMs}ms`).toBeLessThanOrEqual(30_000 + K.SLACK_MS);
    // 차례 마감 때 의사가 탈락하지 않음 (끊긴 지 60초 전)
    expect(ended.at - droppedAt, '끊긴 지 60초 안').toBeLessThan(K.GRACE_MS);
    expect((await t.player(K.U(doctor))).alive, '차례 마감 뒤에도 의사는 산 채').toBe(true);

    // 2일 낮: 보호가 없어 지목된 사람이 죽음 (모두에게 살해 글)
    await L.waitState(t, (g) => g.phase === 'DAY' && g.dayIndex === 2, { timeout: 20_000, message: '2일 낮' });
    await night.waitDead(t, K.U(victim));
    await expect.poll(async () => (await night.readUi(page)).dawnMessages.join(' | '), { timeout: 20_000, message: '낮 시작 살해 글' })
        .toContain(`지난밤 ${victim.nickname}님이 살해당했습니다`);
    await K.clear(page);
    await expect(K.cardOf(page, victim.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
});
