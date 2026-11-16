'use strict';

// 모바일 친구 시트 브라우저 시험 — 찾아서 신청·받기·거절·서로 같은 순간 신청·즐겨찾기·차단과 풀기·차단 목록 빈 글·접속 표시·일반 폴더 접속 수
// 목록 A13-친구-알림-초대.md 번호 A13-E-071~080 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-friend.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const friends = require('../../helpers/friends');
const K = require('../social/_a13-kit');

const { U, TEXT } = K;

/** 봇이 받은 신청 중 그 사람이 보낸 것 받기 */
async function botAccepts(bot, person) {
    const incoming = await friends.botApi(bot, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === U(person));
    expect(row, '봇이 받은 친구 신청').toBeTruthy();
    await friends.botApi(bot, 'PUT', `/friends/requests/${row.request_id}/accept`);
}

/** 봇 소켓 다시 붙이기 (같은 쿠키) */
async function reconnect(bot) {
    const back = new Promise((resolve) => bot.socket.once('connect', resolve));
    bot.socket.connect();
    await back;
}

test('A13-E-071 모바일 친구 시트 친구 추가 탭 검색 → 신청 → 봇 수락 → 친구 목록에 봇 @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await K.sendButton(row, bot.nickname).click();
    await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();

    await botAccepts(bot, user);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});

test('A13-E-072 모바일 봇 신청 → 시트 요청 수락 탭에서 수락 → 친구 목록에 봇', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);
    await K.openTab(page, '요청 수락');
    await K.panel(page).getByRole('button', { name: `${bot.nickname} 수락`, exact: true }).click();
    await expect(K.requestRow(page, bot.nickname)).toHaveCount(0);

    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});

test('A13-E-073 모바일 받은 신청 거절 → 줄 없음, DB DECLINED', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);
    await K.openTab(page, '요청 수락');
    await K.panel(page).getByRole('button', { name: `${bot.nickname} 거절`, exact: true }).click();

    await expect(K.requestRow(page, bot.nickname)).toHaveCount(0);
    await expect.poll(() => K.requestStatuses(bot, user), { message: 'DB 신청 상태' }).toEqual(['DECLINED']);
});

test('A13-E-074 모바일 서로 같은 순간 신청 → 한쪽 실패, DB 기다리는 신청 1줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await expect(row).toBeVisible();

    const [, botTry] = await Promise.allSettled([K.sendButton(row, bot.nickname).click(), K.botRequest(bot, user)]);
    await expect.poll(async () => (await K.pendingBetween(user, bot)).length, { message: '기다리는 신청 줄 수' }).toBe(1);
    const [pending] = await K.pendingBetween(user, bot);
    if (pending.requester_id === U(bot)) await expect(row.getByText(TEXT.pendingDup, { exact: true })).toBeVisible();
    else expect(botTry.status, '봇 신청은 거절됨').toBe('rejected');
    await expect.poll(async () => (await K.pendingBetween(user, bot)).length).toBe(1);
});

test('A13-E-075 모바일 친구 줄 별 → 즐겨찾기 폴더에 그 줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await K.friendRow(page, U(bot)).getByRole('button', { name: '즐겨찾기 추가' }).click();

    const fav = await K.openFolder(page, '즐겨찾기');
    await expect(fav.locator(`li[data-friend-id="${U(bot)}"]`)).toBeVisible();
});

test('A13-E-076 모바일 친구 줄 차단 → 친구 목록에 없음', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await K.friendRow(page, U(bot)).getByRole('button', { name: `${bot.nickname} 차단`, exact: true }).click();

    await expect(K.friendRow(page, U(bot))).toHaveCount(0);
});

test('A13-E-077 모바일 차단 목록에서 풀기 → 친구 목록에 다시', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(bot) });

    await K.openTab(page, '차단 목록');
    await K.blockedList(page).getByRole('button', { name: `${bot.nickname} 차단 해제`, exact: true }).click();
    await expect(K.blockedList(page).getByText(bot.nickname)).toHaveCount(0);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});

test('A13-E-078 모바일 차단 0명 → "차단한 사용자가 없습니다." 읽힘', async ({ user }) => {
    const page = user.page;
    await K.openTab(page, '차단 목록');
    await expectReadable(K.blockedList(page).getByText(TEXT.noBlocks, { exact: true }));
});

test('A13-E-079 모바일 친구 봇 소켓 끊음·다시 연결 → 그 줄 접속 표시가 "오프라인"·"접속 중"으로 바뀜', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toContainText(TEXT.online);

    bot.socket.disconnect();
    const offline = await K.openFolder(page, '오프라인');
    await expect(offline.locator(`li[data-friend-id="${U(bot)}"]`)).toContainText(TEXT.offline);

    await reconnect(bot);
    await expect(K.folderOf(page, '일반').locator(`li[data-friend-id="${U(bot)}"]`)).toContainText(TEXT.online);
});

test('A13-E-080 모바일 봇 친구 3명 중 1명 접속 → 일반 폴더 "(1/3)"', async ({ user, bots }) => {
    const page = user.page;
    const list = await bots.spawn(3);
    for (const bot of list) await K.befriendBot(user, bot);
    list[1].socket.disconnect();
    list[2].socket.disconnect();

    await K.showList(page);
    await expect(K.folderHead(page, '일반')).toHaveAccessibleName('일반 (1/3)');
});
