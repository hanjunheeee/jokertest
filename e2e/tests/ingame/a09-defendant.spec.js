'use strict';

// 끊긴 피고 브라우저 시험 (PC) — 뽑히는 순간 이미 끊겨 있으면 재판 없이 밤(누가 뽑혔는지 안 알림), 재판 도중 끊겨 60초 뒤 탈락하면 피고 사망으로 닫고 밤
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-066·067 (PC 줄) — 기대값은 사용자 결정 2026-11-16 오전 둘째 11번·낮 셋째 2번 (서버 값: 낮 판정 DEFENDANT_DISCONNECTED, 재판 판정 DEFENDANT_DIED)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');
const K = require('./_a09-simple-kit');

const nightNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '밤이 되었습니다' });

// 그 봇 말고 붙어 있는 봇 하나 (판 알림을 대신 받아 봄)
const watcherOf = (t, bot) => t.bots.find((b) => b !== bot && K.isUp(b));

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

test('A09-E-066 PC 7명 판, 이미 끊긴 봇이 피고로 뽑힘 → 재판 창 없이 밤, 그 봇은 산 채, 투표 현황에 "재판 대상의 연결이 끊겨 재판 없음" (결정: 뽑히는 순간 끊겨 있으면 재판 없이 밤) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toVote(t);
    await K.clear(page);
    // 투표 중에 봇이 끊김 → 남은 봇 표가 그 봇에 몰림 → 마감
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected', { timeout: 15_000 });
    const { state } = await K.voteOut(t, K.U(bot));

    expect(state.phase, '재판 없이 밤').toBe('NIGHT');
    expect(K.rowOf(state, K.U(bot)).alive, '끊긴 봇은 60초 안이라 산 채').toBe(true);
    // 낮 판정 알림: 끊긴 피고 값, 누가 뽑혔는지는 안 실림
    const resolved = await watcherOf(t, bot).waitForEvent('day_vote_resolved', { since, timeoutMs: 15_000 });
    expect(resolved.outcome, '낮 판정 값').toBe('DEFENDANT_DISCONNECTED');
    expect(resolved.tribunalTargetUuid ?? null, '뽑힌 사람은 안 알림').toBeNull();
    await expectReadable(nightNotice(page).getByText('밤이 되었습니다'), { timeout: 20_000 });
    await expect(K.tribunalWindow(page)).toHaveCount(0);
    await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected');
    // 투표 현황 창: 왜 재판이 안 열렸는지 글, 재판 대상 칸은 "없음"
    const status = await openStatus(page);
    const outcome = status.getByTestId('vote-status-outcome');
    await expect(outcome).toHaveText('재판 대상의 연결이 끊겨 재판 없음');
    await expectReadable(outcome);
    await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
});

test('A09-E-067 PC 8명 판, 재판 도중 끊긴 피고 봇이 60초(손잡이) 탈락 → 그 봇 사망, 재판 창 닫히고 밤 (결정: 재판 도중이면 재판 취소가 아니라 피고 사망) @game', async ({ user, table }) => {
    const page = user.page;
    // 재판 시간은 가장 길게: 기본 15초면 손잡이보다 진짜 마감(무죄)이 먼저 올 수 있음
    const t = await K.seat(table, user, { n: 8, settings: { tribunalTime: 120 } });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    // 붙어 있는 봇이 피고로 뽑혀 재판이 열림
    const { state } = await K.voteOut(t, K.U(bot));
    expect(state.phase).toBe('TRIBUNAL');
    expect(state.tribunal.defendantUuid).toBe(K.U(bot));
    await expect(K.tribunalWindow(page)).toBeVisible({ timeout: 15_000 });
    await expect(K.tribunalWindow(page)).toContainText(bot.nickname);

    // 재판 중에 피고가 끊김 → 60초 손잡이
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await K.expire(t, K.U(bot));

    // 재판 판정 알림: 재판 취소(CANCELLED)가 아니라 피고 사망, 처형된 사람은 없음
    const resolved = await watcherOf(t, bot).waitForEvent('tribunal_vote_resolved', {
        since, match: (p) => p?.defendantUuid === K.U(bot), timeoutMs: 15_000,
    });
    expect(resolved.outcome, '재판 판정 값').toBe('DEFENDANT_DIED');
    expect(resolved.executedUuid ?? null, '처형은 아님').toBeNull();

    const after = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL', { message: '재판이 끝남' });
    expect(after.phase).toBe('NIGHT');
    expect(after.dayIndex, '날짜 그대로').toBe(state.dayIndex);
    expect(K.rowOf(after, K.U(bot)).alive, '피고 봇 사망').toBe(false);
    await expect(K.tribunalWindow(page)).toHaveCount(0, { timeout: 15_000 });
    await expectReadable(nightNotice(page).getByText('밤이 되었습니다'), { timeout: 20_000 });
    await K.clear(page);
    await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'dead');
});
