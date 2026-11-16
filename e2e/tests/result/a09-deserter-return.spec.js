'use strict';

// 산 채로 나간 사람이 판 끝 뒤 다시 열린 같은 대기방에 코드로 들어가려는 어려운 브라우저 시험 (PC, 사람 2명) — 막힘 중이면 탈주 글
// 목록 A09-끊김-나가기-탈주.md A09-H-025 (방 다시 열기 자체는 A08) — 모이는지만: npx playwright test --list tests/result/a09-deserter-return.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { waitResult } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U } = H;

test('A09-H-025 6명 판(사람 2 + 봇 4) ㄴ이 산 채로 나감 → 판 끝 → ㄱ "대기방으로" → ㄴ이 그 방 코드 입장 → 탈주 글(막힘 중) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await K.leaveAlive(b.page);
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker));
    expect(end.phase).toBe('ENDED');

    await K.pastExpulsion(a.page);
    await waitResult(a.page);
    H.collectDialogs(a.page);
    await a.page.getByRole('button', { name: '대기방으로' }).click();
    await expect(a.page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(U(a)); return Boolean(room?.roomCode); }, { message: 'ㄱ이 돌아간 대기방' }).toBe(true);

    const text = await K.joinByCodeAlert(b.page, room.roomCode);
    expect(text).toMatch(K.COOLDOWN_FIRST);
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    expect((await e2e.roomOf(U(a)))?.players.some((p) => p.uuid === U(b)), 'ㄴ은 그 방에 안 들어감').toBe(false);
});
