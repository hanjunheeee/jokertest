'use strict';

// 모바일 인원이 줄어든 판 브라우저 시험 — 봇 2명이 나가도 승부가 안 났으면 판이 다음 단계로 계속
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-100 (모바일 줄) — 최소 인원 규칙 없음(승패 조건까지 계속)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, clearOverlays, expectPlayerStatus } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

test('A09-E-100 모바일 8명 판, 봇 2명이 나가도 판이 다음 단계로 계속 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    const gone = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 2);
    expect(gone).toHaveLength(2);
    await K.toDay(t);
    await expect(talk.phaseLine(page)).toContainText('낮', { timeout: 15_000 });
    await clearOverlays(page);

    for (const bot of gone) {
        const reply = await bot.request('leave_game_session', { gameId: t.gameId });
        expect(reply?.ok, '봇 나가기를 서버가 받음').toBe(true);
    }
    // 나간 봇 칸은 사망, 판은 안 끝남
    for (const bot of gone) {
        await expectPlayerStatus(page, bot.nickname, '사망', { timeout: 15_000 });
    }
    const now = await t.state();
    expect(now.phase, '승부가 안 났으니 판 계속').not.toBe('ENDED');
    expect(now.winResult ?? null).toBeNull();
    expect(now.players.filter((p) => p.alive)).toHaveLength(6);

    // 다음 단계: 낮 투표 → 밤
    await K.toVote(t);
    await clearOverlays(page);
    await expectReadable(page.getByRole('button', { name: '기권' }).first());
    const s = await K.toNight(t, 1);
    expect(s.phase).toBe('NIGHT');
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
    // 밤이 되면 "밤이 되었습니다" 단계 전환 안내 창이 단계 줄을 덮음 → 닫고 봄 (창이 조금 늦게 뜰 수 있어 닫기·읽기를 같이 다시 함)
    await expect(async () => {
        await clearOverlays(page);
        await expectReadable(talk.phaseLine(page), { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
});
