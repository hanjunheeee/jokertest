'use strict';

// 모바일 탈주 대기 글 브라우저 시험 — 산 채로 나간 뒤 방 만들기·코드 입장·공개 방이 안내 창 "탈주로 ○분 ○초 뒤에…"로 막히고 글이 읽힘, 결과 화면 나가기·탭 닫기는 탈주 아님
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-014·016·019·022·114·116 (모바일 줄) — 모바일은 알림이 양피지 안내 창이라 글 대비까지 봄
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

// 판 앉히고 첫 낮에서 산 채로 나감 → 방 목록 화면
async function desert(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await expect(talk.phaseLine(user.page)).toContainText('낮', { timeout: 15_000 });
    await K.leaveAlive(user.page);
    return t;
}

// 안내 창 글이 읽히는지 본 뒤 닫음
async function readNotice(page) {
    await expectReadable(K.noticeText(page));
    await K.closeNotice(page);
}

test('A09-E-014 모바일 6명 판, 산 채로 나간 뒤 방 만들기 → "탈주로 4분 5○초 뒤에 참여할 수 있습니다." 읽힘 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 6);
    const text = await K.createRoomAlert(page, { close: false });
    expect(text).toMatch(K.COOLDOWN_JUST_NOW);
    await readNotice(page);
    await expect(page).toHaveURL(/\/game-setup/);
});

test('A09-E-016 모바일 8명 판, 산 채로 나간 뒤 코드 입장 → "탈주로 4분 5○초 뒤에 참여할 수 있습니다." 읽힘 @game', async ({ user, table, bots }) => {
    const page = user.page;
    // 들어가 볼 다른 방 (나가기 전에 만들어 둠 → 나간 뒤 10초 안에 눌러 봄)
    const [host] = await bots.spawn(1);
    const room = await host.createRoom();
    await desert(table, user, 8);
    const text = await K.joinByCodeAlert(page, room.roomCode, { close: false });
    expect(text).toMatch(K.COOLDOWN_JUST_NOW);
    await readNotice(page);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A09-E-019 모바일 5명 판, 산 채로 나간 뒤 공개 방 입장 → 탈주 글 읽힘 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    await desert(table, user, 5);
    await K.pickPublicRoom(page, `${host.nickname}의 방`);
    const text = await ui.captureAlert(page, () => K.enterPicked(page).click(), { close: false });
    expect(text).toMatch(K.COOLDOWN_FIRST);
    await readNotice(page);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A09-E-022 모바일 6명 판, 판 끝 → "로비로" → 방 만들기 됨 (탈주 아님) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    await K.toCitizenWin(t, page);
    const message = await K.withConfirm(page, () => page.getByRole('button', { name: '로비로', exact: true }).click(), { accept: true });
    expect(message).toBe(K.EXIT_RESULT_TEXT);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await K.createRoomOk(page);
});

test('A09-E-114 모바일 6명 판, 방 만들기 거절 뒤 "게임 만들기" 단추가 다시 켜져 있음 @game', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 6);
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_FIRST);
    const create = page.getByRole('button', { name: '게임 만들기' });
    await expect(create).toBeEnabled();
    await expectReadable(create);
    await expect(page).toHaveURL(/\/game-setup/);
    // 다시 눌러도 같은 글이 또 뜸 (단추가 진짜로 눌림)
    expect(await ui.captureAlert(page, () => create.click())).toMatch(K.COOLDOWN_FIRST);
});

test('A09-E-116 모바일 5명 판, 판 끝 → 결과 화면에서 탭 닫음 → 새 탭 방 만들기 됨 (탈주 아님) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await K.seat(table, user, { n: 5 });
    await K.toCitizenWin(t, user.page);
    await user.page.close();
    const tab = await user.context.newPage();
    await K.createRoomOk(tab);
});
