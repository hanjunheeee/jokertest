'use strict';

// 모바일 죽은 사람 풀기 브라우저 시험 — 처형된 뒤 나가거나 탭을 닫으면 바로 방 만들기, 다시 열면 관전 그대로, 사망 창 글이 읽힘
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-024·026·028·108 (모바일 줄) — 처형까지는 봇 표와 손잡이로 감
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable, expectAllReadable } = require('../../helpers/visible');
const { talk, getExecuted, expectRosterCount, expectPlayerStatus } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

// 판 앉히고 봇 표로 내가 처형될 때까지 (사망 창은 열린 채로 둠)
async function seatAndDie(table, user, n) {
    const t = await K.seat(table, user, { n });
    await getExecuted(t, K.U(user), { pages: [user.page], keepWatching: false });
    return t;
}

// 탭을 닫고 서버가 끊김을 알 때까지 기다린 뒤 같은 브라우저 새 탭
async function closeAndReopen(t, user) {
    const since = Date.now();
    await user.page.close();
    await K.droppedAt(t, K.U(user), since);
    return user.context.newPage();
}

test('A09-E-024 모바일 5명 판, 처형 → "게임 나가기" → 바로 방 만들기 됨 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await seatAndDie(table, user, 5);
    await K.pressDeadExit(page, { accept: true });
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    await K.createRoomOk(page);
});

test('A09-E-026 모바일 7명 판, 처형된 뒤 탭 닫고 새 탭에서 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await seatAndDie(table, user, 7);
    const tab = await closeAndReopen(t, user);
    await K.createRoomOk(tab);
});

test('A09-E-028 모바일 6명 판, 처형된 뒤 탭 닫고 다시 판 화면 → 관전 그대로 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const me = K.U(user);
    const t = await seatAndDie(table, user, 6);
    const tab = await closeAndReopen(t, user);
    await tab.goto('/ingame');
    await expect(tab).toHaveURL(/\/ingame/);
    await expect(talk.layout(tab)).toBeVisible({ timeout: 20_000 });
    // 새 탭이라 사망 창이 다시 뜸 → 관전 계속
    const dialog = await K.waitDeadChoice(tab);
    await dialog.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(dialog).toBeHidden();
    await expect(tab).toHaveURL(/\/ingame/);
    await expectPlayerStatus(tab, user.account.nickname, '사망');
    await expectRosterCount(tab, 6);
    // 판 자리는 남아 있음 (죽은 채 참여 중)
    const row = await t.player(me);
    expect(row.alive).toBe(false);
    expect(row.isParticipating).toBe(true);
});

test('A09-E-108 모바일 7명 판, 처형 뒤 사망 창 글·단추가 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await seatAndDie(table, user, 7);
    const dialog = await K.waitDeadChoice(page);
    await expectReadable(dialog.getByText('당신은 사망했습니다.', { exact: true }));
    await expectReadable(dialog.getByText(K.EXIT_DEAD_LINE, { exact: true }));
    await expectReadable(dialog.getByRole('button', { name: '관전 계속하기' }));
    await expectReadable(dialog.getByRole('button', { name: '게임 나가기' }));
    expect(await expectAllReadable(dialog.getByRole('button'))).toBe(2);
});
