'use strict';

// 탈주 대기 5분을 진짜로 기다리는 브라우저 시험 (PC, 이 시험만 쓰는 새 계정) — 첫 탈주 5분 끝을 경계로 거절·됨, 같은 날 두 번째 탈주는 30분 글
// 목록 A09-끊김-나가기-탈주.md A09-H-016·017 (계획 3-5 "5분 진짜") — 한국 날이 바뀌는 0시 근처에 돌리면 017은 횟수가 0으로 돌아가 틀림 / 모이는지만: npx playwright test --list tests/ingame/a09-desertion-real.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { openSetup } = require('../room/roomHelpers');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U } = H;
const FIVE_MIN = 5 * 60_000;
const THIRTY_MIN = 30 * 60_000;

// 5명 판(사람 1 + 봇 4) 첫 낮에 산 채로 나감 → 방 목록
async function desert(table, user) {
    const t = await H.seat(table, [user], { n: 5 });
    await K.toDay(t);
    await K.leaveAlive(user.page);
    return t;
}

// 그 판 탈주 줄이 DB에 적힐 때까지 → { desertedAt, blockedUntil } (ms)
async function rowOf(uuid, gameId) {
    let row = null;
    await expect.poll(async () => {
        row = (await H.desertionRows(uuid)).find((r) => r.game_id === gameId) ?? null;
        return Boolean(row);
    }, { timeout: 15_000, message: '탈주 줄' }).toBe(true);
    expect(row.reason).toBe('LEFT_ALIVE');
    return { desertedAt: new Date(row.deserted_at).getTime(), blockedUntil: new Date(row.blocked_until).getTime() };
}

test('A09-H-016 5명 판(사람 1 + 봇 4) 산 채로 나감 → "탈주로 4분 5○초…" → 4분 58초에 거절 → 5분 1초에 방 만들기 됨 @game @hard @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(480_000);
    const page = user.page;
    const t = await desert(table, user);
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_JUST_NOW);
    const { desertedAt, blockedUntil } = await rowOf(U(user), t.gameId);
    // DB 시각은 초 단위로 반올림돼 ±1초
    expect(Math.abs(blockedUntil - desertedAt - FIVE_MIN)).toBeLessThanOrEqual(1000);

    // 4분 58초: 아직 막힘 (남은 2초 안팎 → 1분 아래 글은 초만 나옴)
    await openSetup(page);
    await K.sleepUntil(desertedAt + FIVE_MIN - 2000);
    const late = await ui.captureAlert(page, () => page.getByRole('button', { name: '게임 만들기' }).click());
    expect(late).toMatch(/^탈주로 [1-4]초 뒤에 참여할 수 있습니다\.$/);
    await expect(page).toHaveURL(/\/game-setup/);
    // 5분 1초: 막힘 끝 → 대기방까지
    await K.sleepUntil(desertedAt + FIVE_MIN + 1000);
    await K.createRoomOk(page);
});

test('A09-H-017 5명 판 둘(이 시험만 쓰는 계정) 첫 탈주 → 5분 기다림 → 둘째 판에서 또 산 채로 나감 → "탈주로 29분 5○초…" @game @hard @realtime', async ({ user, table }) => {
    test.setTimeout(720_000);
    const page = user.page;
    const first = await desert(table, user);
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_JUST_NOW);
    const one = await rowOf(U(user), first.gameId);
    // 첫 막힘이 끝날 때까지 진짜로 기다림
    await K.sleepUntil(one.blockedUntil + 1500);

    const second = await desert(table, user);
    expect(await K.createRoomAlert(page)).toMatch(/^탈주로 29분 5\d초 뒤에 참여할 수 있습니다\.$/);
    const two = await rowOf(U(user), second.gameId);
    expect(Math.abs(two.blockedUntil - two.desertedAt - THIRTY_MIN), '같은 날 두 번째 = 30분').toBeLessThanOrEqual(1000);
    expect(await H.desertionRows(U(user))).toHaveLength(2);
});
