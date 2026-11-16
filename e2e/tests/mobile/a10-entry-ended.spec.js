'use strict';

// 로비 입장 정리 브라우저 시험 (모바일, 끝난 판) — 결과 화면에 머문 채 로비·방 목록 주소로 가면 끝난 판에서 빠져 바로 방 만들기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-035·060 (판은 봇 방장, 봇 표로 광대 처형 → 시민 승 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const K = require('../ingame/_a09-simple-kit');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 폰 게임 설정 화면에서 처음 값으로 방 만들기 → 대기방, 방장 = 나 (거절 안내 창 글이 없어야 함) */
async function makeRoom(person) {
    const page = person.page;
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

test('A10-E-035 모바일 6명 판 끝 → 결과 화면에서 주소 /lobby → 방 만들기 됨 @game @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    await K.toCitizenWin(t, page);
    await ui.gotoLobby(page);
    await expect(page).toHaveURL(/\/lobby/);
    await makeRoom(user);
});

test('A10-E-060 모바일 5명 판 끝 → 결과 화면에서 주소 /multiplay → 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 5 });
    await K.toCitizenWin(t, page);
    await page.goto('/multiplay');
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    await expect(page).toHaveURL(/\/multiplay/);
    await makeRoom(user);
});
