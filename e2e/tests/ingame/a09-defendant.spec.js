'use strict';

// 끊긴 피고 브라우저 시험 (PC) — 뽑히는 순간 이미 끊겨 있으면 재판을 취소하고 밤, 재판 도중 끊겨 60초 뒤 탈락하면 그 사람 사망으로 처리하고 밤
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-066·067 (PC 줄) — 기대값은 목록(임시 10)이 아니라 사용자 결정 2026-11-16 오전 둘째 11번 (코드는 아직 옛 동작일 수 있음)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');
const K = require('./_a09-simple-kit');

const nightNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '밤이 되었습니다' });

test('A09-E-066 PC 7명 판, 이미 끊긴 봇이 피고로 뽑힘 → 재판 창 없이 밤, 그 봇은 산 채 (결정: 뽑히는 순간 끊겨 있으면 재판 취소) @game @smoke', async ({ user, table }) => {
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
    await expectReadable(nightNotice(page).getByText('밤이 되었습니다'), { timeout: 20_000 });
    await expect(K.tribunalWindow(page)).toHaveCount(0);
    await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'disconnected');
});

test('A09-E-067 PC 8명 판, 재판 도중 끊긴 피고 봇이 60초(손잡이) 탈락 → 그 봇 사망, 재판 창 닫히고 밤 (결정: 재판 도중이면 그 사람 사망) @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
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

    const after = await L.waitState(t, (g) => g.phase !== 'TRIBUNAL', { message: '재판이 끝남' });
    expect(after.phase).toBe('NIGHT');
    expect(after.dayIndex, '날짜 그대로').toBe(state.dayIndex);
    expect(K.rowOf(after, K.U(bot)).alive, '피고 봇 사망').toBe(false);
    await expect(K.tribunalWindow(page)).toHaveCount(0, { timeout: 15_000 });
    await expectReadable(nightNotice(page).getByText('밤이 되었습니다'), { timeout: 20_000 });
    await K.clear(page);
    await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'dead');
});
