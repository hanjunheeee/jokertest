'use strict';

// 인원이 줄어든 판 브라우저 시험 (PC) — 봇 여럿이 나가거나 60초(손잡이)로 빠져도 승부가 안 났으면 판이 다음 단계로 계속
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-097~099 (PC 줄) — 최소 인원 규칙 없음(승패 조건까지 계속)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');
const K = require('./_a09-simple-kit');

// 봇이 스스로 판에서 나감 (산 채로 나가면 바로 죽음 처리)
async function botLeaves(t, bot) {
    const reply = await bot.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, '봇 나가기를 서버가 받음').toBe(true);
}

// 빠진 봇 카드는 사망, 판은 안 끝나고 투표 → 밤으로 이어짐
async function expectGoesOn(t, page, gone, aliveLeft) {
    for (const bot of gone) {
        await expect(K.cardOf(page, bot.nickname)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
    }
    const now = await t.state();
    expect(now.phase, '승부가 안 났으니 판 계속').not.toBe('ENDED');
    expect(now.winResult ?? null).toBeNull();
    expect(now.players.filter((p) => p.alive)).toHaveLength(aliveLeft);
    // 다음 단계: 낮 투표
    await K.toVote(t);
    await K.clear(page);
    await expectReadable(page.getByRole('button', { name: '기권' }));
    // 그다음: 밤
    const s = await K.toNight(t, 1);
    expect(s.phase).toBe('NIGHT');
    expect(s.players.filter((p) => p.alive)).toHaveLength(aliveLeft);
    await L.closeNotice(page, '밤이 되었습니다');
}

test('A09-E-097 PC 7명 판, 봇 3명이 나가도 판이 다음 단계로 계속 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    const gone = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 3);
    expect(gone).toHaveLength(3);
    await K.toDay(t);
    await K.clear(page);
    for (const bot of gone) await botLeaves(t, bot);
    await expectGoesOn(t, page, gone, 4);
});

test('A09-E-098 PC 10명 판, 봇 4명이 60초(손잡이)로 빠져도 판이 다음 단계로 계속 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 10 });
    const gone = K.botsOf(t, await t.state(), 'CITIZEN').slice(0, 4);
    expect(gone).toHaveLength(4);
    await K.toDay(t);
    await K.clear(page);
    const since = Date.now();
    for (const bot of gone) K.dropBot(bot);
    for (const bot of gone) await K.droppedAt(t, K.U(bot), since);
    const fired = (await t.expireGraces()).fired;
    for (const bot of gone) expect(fired, '손잡이가 60초를 끝낸 사람').toContain(K.U(bot));
    await expectGoesOn(t, page, gone, 6);
});

test('A09-E-099 PC 5명 판, 시민 봇 1명이 나가 4명이 돼도 판이 다음 단계로 계속 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 5 });
    const gone = [K.botOf(t, await t.state(), 'CITIZEN')];
    await K.toDay(t);
    await K.clear(page);
    await botLeaves(t, gone[0]);
    await expectGoesOn(t, page, gone, 4);
});
