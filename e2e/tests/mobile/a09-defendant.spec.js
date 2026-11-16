'use strict';

// 모바일 끊긴 피고 브라우저 시험 — 뽑히는 순간 이미 끊겨 있는 봇이면 재판을 취소하고 밤
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-068 (모바일 줄) — 기대값은 목록(임시 10 "재판 열림")이 아니라 사용자 결정 2026-11-16 오전 둘째 11번 (코드는 아직 옛 동작일 수 있음)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, clearOverlays } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

test('A09-E-068 모바일 6명 판, 이미 끊긴 봇이 피고로 뽑힘 → 재판 창 없이 밤, 그 봇은 산 채 (결정: 뽑히는 순간 끊겨 있으면 재판 취소) @game @smoke', async ({ user, table }) => {
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
    await expect(talk.slot(page, bot.nickname)).toHaveAccessibleName(`${bot.nickname}, 연결 끊김`, { timeout: 15_000 });
    const { state } = await K.voteOut(t, K.U(bot));

    expect(state.phase, '재판 없이 밤').toBe('NIGHT');
    expect(K.rowOf(state, K.U(bot)).alive, '끊긴 봇은 60초 안이라 산 채').toBe(true);
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
    await expectReadable(talk.phaseLine(page));
    await expect(K.tribunalWindow(page)).toHaveCount(0);
    await expect(talk.slot(page, bot.nickname)).toHaveAccessibleName(`${bot.nickname}, 연결 끊김`);
});
