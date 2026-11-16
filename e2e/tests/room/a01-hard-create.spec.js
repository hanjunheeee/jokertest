'use strict';

// 방 만들기 어려운 브라우저 시험 (사람 여럿) — 같은 계정 두 탭이 거의 같이 만들기, PC·모바일 두 사람이 서로 목록에서 상대 방 보기, 죽은 사람이 판 밖에서 방 만들기
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-011·012·015 (@hard), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-hard-create.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { openRoomList, findRoomRow } = require('./roomHelpers');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('./_a01a-kit');

/** 목록에서 그 방 줄 (못 찾으면 실패) */
async function rowOf(page, title) {
    const row = await findRoomRow(page, title, { timeoutMs: 15_000 });
    expect(row, `공개 방 목록에 "${title}" 줄`).not.toBeNull();
    return row;
}

test('A01-H-011 같은 계정 두 탭에서 거의 같이 "게임 만들기" → 그 계정 방 1개, 대기방 화면인 탭은 그 방을 보임 @hard @smoke', async ({ user, bots }) => {
    const [probe] = await bots.spawn(1);
    const tab1 = user.page;
    const tab2 = await user.context.newPage();
    for (const p of [tab1, tab2]) p.on('dialog', (d) => { d.accept().catch(() => {}); });
    await K.openSetupPage(tab1);
    await K.openSetupPage(tab2);
    // 먼저 붙은 탭은 밀려나 안내 창이 덮을 수 있음 → 덮개를 지나 단추를 바로 누름 (두 탭 거의 같은 때)
    await Promise.all([tab1, tab2].map((p) => p.getByRole('button', { name: '게임 만들기' }).evaluate((el) => el.click())));

    const room = await K.waitRoom(K.U(user));
    await expect.poll(async () => (await K.listedTitled(probe, K.titleOf(user))).length).toBe(1);
    // 방에 묶인 탭은 그 방(정원 10에 1명)을 보임, 아닌 탭은 대기방이 아님
    for (const p of [tab1, tab2]) {
        if (/\/game-matching/.test(p.url())) await expect(K.capacity(p)).toHaveText('1/10');
    }
    expect(room.players).toHaveLength(1);
    const listed = await K.listedTitled(probe, K.titleOf(user));
    expect(listed[0].id).toBe(room.roomId);
});

test('A01-H-012 PC 사람·모바일 사람 각자 공개 방 → 서로 목록에 상대 방, 봇이 들어가면 인원 갱신 @hard', async ({ user, players, bots }) => {
    const A = user;
    const B = await players.add({ mobile: true });
    // A 방 → B 목록에 보임 (목록 화면을 열면 내 대기방에서 빠지므로 차례로 봄)
    const roomA = await K.createRoomOn(A, { code: false });
    await openRoomList(B.page);
    await rowOf(B.page, K.titleOf(A));
    // B 방 → A 목록에 보임, 봇이 B 방에 들어가면 A 목록 인원 "2/10"
    const roomB = await K.createRoomOn(B, { code: false });
    await openRoomList(A.page);
    const row = await rowOf(A.page, K.titleOf(B));
    await expect(row.getByText('1/10', { exact: true })).toBeVisible();
    const [guest] = await bots.spawn(1);
    await guest.joinByCode(roomB.roomCode);
    await expect(row.getByText('2/10', { exact: true })).toBeVisible();
    expect(roomA.roomId).not.toBe(roomB.roomId);
});

test('A01-H-015 사람 2 + 봇 5 = 7명 판에서 A 처형돼 죽음 → A 판 밖으로 → 방 만들기 됨·목록에 뜸, B 판은 그대로 진행 @game @hard', async ({ user, players, bots, table }) => {
    test.setTimeout(240_000);
    const A = user;
    const B = await players.add();
    const t = await table.setup({
        humans: [A, B],
        bots: 5,
        roles: ({ humans, bots: list }) => ({
            [K.U(humans[0])]: 'CITIZEN', [K.U(humans[1])]: 'CITIZEN',
            [K.U(list[0])]: 'JOKER', [K.U(list[1])]: 'DOCTOR', [K.U(list[2])]: 'CITIZEN', [K.U(list[3])]: 'CITIZEN', [K.U(list[4])]: 'CITIZEN',
        }),
    });
    const s = await t.state();
    expect(s.players).toHaveLength(7);
    for (const h of [A, B]) await ui.readRoleReveal(h.page);
    // 봇 5표 > 기권 2(사람 둘) → 재판 → 유죄
    await A9.execute(t, K.U(A));
    await A9.pressDeadExit(A.page, { accept: true });
    await A9.createRoomOk(A.page);
    const room = await K.waitRoom(K.U(A));
    const [probe] = await bots.spawn(1);
    await expect.poll(async () => (await K.listedTitled(probe, K.titleOf(A))).map((r) => r.id)).toEqual([room.roomId]);
    // B 판은 안 끝나고 그대로 (광대 살아 있음)
    const after = await e2e.gameOf(K.U(B));
    expect(after?.gameId).toBe(t.gameId);
    expect(after.phase).not.toBe('ENDED');
    await expect(B.page).toHaveURL(/\/ingame/);
});
