'use strict';

// 모바일 끊긴 피고 브라우저 시험 — 뽑히는 순간 이미 끊겨 있는 봇이면 재판 없이 밤 (누가 뽑혔는지 안 알림)
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-068 (모바일 줄) — 기대값은 사용자 결정 2026-11-16 오전 둘째 11번·낮 셋째 2번 (서버 낮 판정 값 DEFENDANT_DISCONNECTED)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, clearOverlays, expectPlayerStatus } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

test('A09-E-068 모바일 6명 판, 이미 끊긴 봇이 피고로 뽑힘 → 재판 창 없이 밤, 그 봇은 산 채, 투표 현황에 "재판 대상의 연결이 끊겨 재판 없음" (결정: 뽑히는 순간 끊겨 있으면 재판 없이 밤) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    const bot = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toVote(t);
    await expect(page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 15_000 });
    await clearOverlays(page);
    // 투표 중에 봇이 끊김 → 남은 봇 표가 그 봇에 몰림 → 마감
    const since = Date.now();
    K.dropBot(bot);
    await K.droppedAt(t, K.U(bot), since);
    await expectPlayerStatus(page, bot.nickname, '연결 끊김', { timeout: 15_000 });
    const { state } = await K.voteOut(t, K.U(bot));

    expect(state.phase, '재판 없이 밤').toBe('NIGHT');
    expect(K.rowOf(state, K.U(bot)).alive, '끊긴 봇은 60초 안이라 산 채').toBe(true);
    // 낮 판정 알림: 끊긴 피고 값, 누가 뽑혔는지는 안 실림
    const watcher = t.bots.find((b) => b !== bot && K.isUp(b));
    const resolved = await watcher.waitForEvent('day_vote_resolved', { since, timeoutMs: 15_000 });
    expect(resolved.outcome, '낮 판정 값').toBe('DEFENDANT_DISCONNECTED');
    expect(resolved.tribunalTargetUuid ?? null, '뽑힌 사람은 안 알림').toBeNull();
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
    // 밤이 되면 "밤이 되었습니다" 단계 전환 안내 창이 단계 줄을 덮음 → 닫고 봄 (창이 조금 늦게 뜰 수 있어 닫기·읽기를 같이 다시 함)
    await expect(async () => {
        await clearOverlays(page);
        await expectReadable(talk.phaseLine(page), { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(K.tribunalWindow(page)).toHaveCount(0);
    await expectPlayerStatus(page, bot.nickname, '연결 끊김');
    // 투표 현황 창: 왜 재판이 안 열렸는지 글 (밤 안내 창이 덮으면 닫고 엶)
    const status = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await status.isVisible())) {
            await clearOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(status).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    const outcome = status.getByTestId('vote-status-outcome');
    await expect(outcome).toHaveText('재판 대상의 연결이 끊겨 재판 없음');
    await expectReadable(outcome);
});
