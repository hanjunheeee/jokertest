'use strict';

// 친구 끊기 브라우저 시험 (PC, 2026-11-16 새로 만든 기능) — 한 번 묻고 끊음·끊으면 내 목록·상대 목록·즐겨찾기 폴더에서 빠짐(상대에게 알림 없음)·끊은 뒤 다시 친구
// 목록 A13-친구-알림-초대.md 번호 A13-E-506~510 (결정 둘째 12), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-unfriend.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT, nickOf } = K;

const ASK_TEXT = '친구를 끊을까요?';
const askButton = (row, name) => row.getByRole('button', { name: `${name} 친구 끊기`, exact: true });
const confirmButton = (row, name) => row.getByRole('button', { name: `${name} 친구 끊기 확인`, exact: true });
const keepButton = (row, name) => row.getByRole('button', { name: `${name} 친구 끊기 취소`, exact: true });

/** 친구 줄에서 "끊기" → 확인 */
async function unfriend(row, name) {
    await askButton(row, name).click();
    await confirmButton(row, name).click();
}

/** 이 화면이 보낸 친구 끊기 요청 수 (DELETE /friends/<id>, 차단 풀기 길은 뺌) → { n } */
function countUnfriends(page) {
    const box = { n: 0 };
    page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (r.method() === 'DELETE' && path.startsWith('/friends/') && !path.startsWith('/friends/blocks')) box.n += 1;
    });
    return box;
}

test('A13-E-506 친구 줄 "끊기" → "친구를 끊을까요?" 보임(요청 안 나감) → "취소" → 줄 그대로', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    const sent = countUnfriends(page);
    await K.showList(page);
    const row = K.friendRow(page, U(bot));

    await askButton(row, bot.nickname).click();
    await expect(row.getByText(ASK_TEXT, { exact: true })).toBeVisible();
    expect(sent.n, '끊기 요청').toBe(0);
    await keepButton(row, bot.nickname).click();
    await expect(row.getByText(ASK_TEXT, { exact: true })).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(sent.n, '끊기 요청').toBe(0);
});

test('A13-E-507 "끊기" → 확인 → 친구 목록에 봇 줄 없음, 새로고침해도 없음 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await unfriend(K.friendRow(page, U(bot)), bot.nickname);
    await expect(K.friendRow(page, U(bot))).toHaveCount(0);

    await ui.gotoLobby(page);
    await K.showList(page);
    await expect(K.folderHead(page, '일반')).toBeVisible();
    await expect(K.friendRow(page, U(bot))).toHaveCount(0);
});

test('A13-E-508 A가 B를 끊음 → B 화면 친구 목록에서 새로고침 없이 A 줄 없음, B 알림 배지 그대로 (사람 2)', async ({ players }) => {
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await K.showList(b.page);
    await expect(K.friendRow(b.page, U(a))).toBeVisible();
    const before = await K.noticeEntry(b.page).getAttribute('data-notification-unread-count');

    await K.showList(a.page);
    await unfriend(K.friendRow(a.page, U(b)), nickOf(b));
    await expect(K.friendRow(a.page, U(b))).toHaveCount(0);

    await expect(K.friendRow(b.page, U(a))).toHaveCount(0);
    await expect(K.noticeEntry(b.page)).toHaveAttribute('data-notification-unread-count', before);
});

test('A13-E-509 즐겨찾기한 친구를 끊음 → "즐겨찾기 (0)"', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await friends.api(user, 'PUT', `/friends/favorites/${U(bot)}`, { favorite: true });
    await K.showList(page);
    const fav = await K.openFolder(page, '즐겨찾기');
    await unfriend(fav.locator(`li[data-friend-id="${U(bot)}"]`), bot.nickname);

    await expect(K.folderHead(page, '즐겨찾기')).toHaveAccessibleName('즐겨찾기 (0)');
});

test('A13-E-510 끊기 → 봇 검색 → 신청 → 봇이 받음 → 친구 목록에 다시 1줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await unfriend(K.friendRow(page, U(bot)), bot.nickname);
    await expect(K.friendRow(page, U(bot))).toHaveCount(0);

    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await K.sendButton(row, bot.nickname).click();
    await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    const incoming = await friends.botApi(bot, 'GET', '/friends/requests/incoming');
    const request = incoming.find((r) => r.id === U(user));
    expect(request, '봇이 받은 친구 신청').toBeTruthy();
    await friends.botApi(bot, 'PUT', `/friends/requests/${request.request_id}/accept`);

    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toHaveCount(1);
});
