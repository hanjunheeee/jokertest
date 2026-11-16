'use strict';

// 탈주 대기 글 브라우저 시험 (PC) — 산 채로 나간 뒤 방 만들기·코드 입장·공개 방·초대 수락이 "탈주로 ○분 ○초 뒤에…" 글로 막힘, 결과 화면 나가기·탭 닫기는 탈주 아님
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-013·015·017·018·020·021·103·104·113·115 (PC 줄) — PC는 브라우저 알림 창이라 글만 봄(대비는 못 봄)
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const { api, botApi } = require('../../helpers/friends');
const { openFriendPanel, openTab } = require('../lobby/lobbyHelpers');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');
const K = require('./_a09-simple-kit');

// 판 앉히고 첫 낮에서 산 채로 나감 → 방 목록 화면
async function desert(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await K.leaveAlive(user.page);
    return t;
}

// "탈주로 4분 57초 뒤에…" → 남은 초 297
function secondsLeft(text) {
    const m = /^탈주로 (\d+)분 (\d+)초 뒤에 참여할 수 있습니다\.$/.exec(text);
    if (!m) throw new Error(`탈주 글 모양이 아님: ${text}`);
    return Number(m[1]) * 60 + Number(m[2]);
}

test('A09-E-013 PC 5명 판, 산 채로 나간 뒤 방 만들기 → "탈주로 4분 5○초 뒤에 참여할 수 있습니다." @game @smoke', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 5);
    const text = await K.createRoomAlert(page);
    expect(text).toMatch(K.COOLDOWN_JUST_NOW);
    // 방이 안 만들어져 방 만들기 화면 그대로
    await expect(page).toHaveURL(/\/game-setup/);
});

test('A09-E-015 PC 7명 판, 산 채로 나간 뒤 코드 입장 → "탈주로 4분 5○초 뒤에 참여할 수 있습니다." @game', async ({ user, table, bots }) => {
    const page = user.page;
    // 들어가 볼 다른 방 (나가기 전에 만들어 둠 → 나간 뒤 10초 안에 눌러 봄)
    const [host] = await bots.spawn(1);
    const room = await host.createRoom();
    await desert(table, user, 7);
    const text = await K.joinByCodeAlert(page, room.roomCode);
    expect(text).toMatch(K.COOLDOWN_JUST_NOW);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A09-E-017 PC 10명 판, 산 채로 나간 뒤 공개 방 입장 → 탈주 글 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    await desert(table, user, 10);
    await K.pickPublicRoom(page, `${host.nickname}의 방`);
    const text = await ui.captureAlert(page, () => K.enterPicked(page).click());
    expect(text).toMatch(K.COOLDOWN_FIRST);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A09-E-018 PC 6명 판, 산 채로 나간 뒤 초대 수락 → 그 초대 줄에 탈주 글 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = K.U(user);
    // 친구(봇)는 판에 들어가기 전에 맺어 둠
    const [friend] = await bots.spawn(1);
    await botApi(friend, 'POST', '/friends/requests', { receiverId: me });
    const incoming = await api(user, 'GET', '/friends/requests/incoming');
    const request = incoming.find((r) => r.id === friend.uuid);
    await api(user, 'PUT', `/friends/requests/${request.request_id}/accept`);

    await desert(table, user, 6);
    // 친구가 대기방을 만들어 나를 초대
    await friend.createRoom();
    await botApi(friend, 'POST', '/friends/invites', { receiverId: me, creationKey: crypto.randomUUID() });

    await ui.gotoLobby(page);
    await openFriendPanel(page);
    await openTab(page, '게임 초대');
    const row = page.getByRole('list', { name: '받은 게임 초대' }).locator('[data-invite-id]').filter({ hasText: friend.nickname });
    await row.getByRole('button', { name: '초대 수락' }).click();
    // 거절 글은 그 초대 줄 안 글 칸에 뜸
    const refusal = row.locator('[data-invite-error]');
    await expect(refusal).toHaveText(K.COOLDOWN_FIRST);
    await expectReadable(refusal);
    // 대기방으로 안 들어감
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A09-E-020 PC 7명 판, 막힘 중에도 공개 방 목록은 보임 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    const title = `${host.nickname}의 방`;
    await desert(table, user, 7);
    // 지금 막힘 중인지 먼저 확인 (방 만들기가 탈주 글로 거절됨)
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_FIRST);
    await openRoomList(page);
    const row = await findRoomRow(page, title, { timeoutMs: 30_000 });
    expect(row, `공개 방 목록에 "${title}" 줄`).not.toBeNull();
    await expectReadable(row.getByText(title, { exact: true }));
});

test('A09-E-021 PC 7명 판, 판 끝 → "로비로" → 방 만들기 됨 (탈주 아님) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    await K.toCitizenWin(t, page);
    const message = await K.withConfirm(page, () => page.getByRole('button', { name: '로비로', exact: true }).click(), { accept: true });
    expect(message).toBe(K.EXIT_RESULT_TEXT);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await K.createRoomOk(page);
});

test('A09-E-103 PC 6명 판, 탈주 글 남은 시간이 줄어듦 (10초 뒤 다시 누르면 초가 줄어 있음) @game', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 6);
    const first = secondsLeft(await K.createRoomAlert(page));
    const firstAt = Date.now();
    // 남은 시간이 실제로 줄어드는지 보는 케이스라 진짜로 10초 기다림
    await sleep(10_000);
    const second = secondsLeft(await K.createRoomAlert(page));
    const elapsedSec = (Date.now() - firstAt) / 1000;
    expect(second, '두 번째 글의 남은 초').toBeLessThan(first);
    // 줄어든 만큼 = 지난 시간 (±1.5초)
    expect(Math.abs((first - second) - elapsedSec)).toBeLessThanOrEqual(K.SLACK_MS / 1000);
});

test('A09-E-104 PC 5명 판, 막힘 중 로비 화면은 그대로 열림 @game', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 5);
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_FIRST);
    await ui.gotoLobby(page);
    await expect(page).toHaveURL(/\/lobby$/);
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    // 로비 단추가 눌러지는 자리에 보임 (그림 단추라 대비는 안 셈)
    await expectReadable(page.getByRole('button', { name: '친구 목록' }), { contrast: false });
});

test('A09-E-113 PC 5명 판, 방 만들기 거절 뒤 "게임 만들기" 단추가 다시 켜져 있음 @game', async ({ user, table }) => {
    const page = user.page;
    await desert(table, user, 5);
    expect(await K.createRoomAlert(page)).toMatch(K.COOLDOWN_FIRST);
    const create = page.getByRole('button', { name: '게임 만들기' });
    await expect(create).toBeEnabled();
    await expectReadable(create);
    await expect(page).toHaveURL(/\/game-setup/);
    // 다시 눌러도 같은 글이 또 뜸 (단추가 진짜로 눌림)
    expect(await ui.captureAlert(page, () => create.click())).toMatch(K.COOLDOWN_FIRST);
});

test('A09-E-115 PC 8명 판, 판 끝 → 결과 화면에서 탭 닫음 → 새 탭 방 만들기 됨 (탈주 아님) @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await K.seat(table, user, { n: 8 });
    await K.toCitizenWin(t, user.page);
    await user.page.close();
    const tab = await user.context.newPage();
    await K.createRoomOk(tab);
});
