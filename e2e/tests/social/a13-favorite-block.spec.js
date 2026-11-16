'use strict';

// 즐겨찾기·차단 브라우저 시험 (PC) — 별 켜고 끄면 폴더가 바뀜·상대 쪽엔 별 없음·친구 줄 차단·풀면 친구와 별이 다시·봇이 나를 차단·차단하면 받은 신청도 사라짐·차단 탭 글과 단추 이름
// 목록 A13-친구-알림-초대.md 번호 A13-E-011~020 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-favorite-block.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT } = K;

/** 봇 n개를 만들어 사람과 친구로 맺음 → 봇 목록 */
async function botFriends(bots, user, n) {
    const list = await bots.spawn(n);
    for (const bot of list) await K.befriendBot(user, bot);
    return list;
}

const setFavorite = (person, bot, favorite) => friends.api(person, 'PUT', `/friends/favorites/${U(bot)}`, { favorite });

test('A13-E-011 봇 친구 2명 중 한 명 별 켬 → 그 줄이 즐겨찾기 폴더로, 새로고침해도 그대로 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 2);
    await K.showList(page);
    await K.friendRow(page, U(a)).getByRole('button', { name: '즐겨찾기 추가' }).click();

    const fav = await K.openFolder(page, '즐겨찾기');
    await expect(fav.locator(`li[data-friend-id="${U(a)}"]`)).toBeVisible();

    await ui.gotoLobby(page);
    await K.showList(page);
    const again = await K.openFolder(page, '즐겨찾기');
    await expect(again.locator(`li[data-friend-id="${U(a)}"]`)).toBeVisible();
    await expect(again.locator(`li[data-friend-id="${U(a)}"]`).getByRole('button', { name: '즐겨찾기 해제' })).toBeVisible();
});

test('A13-E-012 즐겨찾기 폴더 줄 별 끔 → 그 줄이 일반 폴더로', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 2);
    await setFavorite(user, a, true);
    await K.showList(page);
    const fav = await K.openFolder(page, '즐겨찾기');
    await fav.locator(`li[data-friend-id="${U(a)}"]`).getByRole('button', { name: '즐겨찾기 해제' }).click();

    const normal = await K.openFolder(page, '일반');
    await expect(normal.locator(`li[data-friend-id="${U(a)}"]`)).toBeVisible();
    await expect(K.folderOf(page, '즐겨찾기').locator(`li[data-friend-id="${U(a)}"]`)).toHaveCount(0);
});

test('A13-E-013 사람이 봇 별 켬 → 봇이 받는 친구 목록의 사람 줄은 isFavorite false (한쪽 표시)', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 1);
    await K.showList(page);
    await K.friendRow(page, U(a)).getByRole('button', { name: '즐겨찾기 추가' }).click();
    // 사람 쪽 저장이 끝난 뒤 봄
    await expect.poll(async () => (await friends.api(user, 'GET', '/friends/favorites')).includes(U(a)), { message: '사람 즐겨찾기 저장' }).toBe(true);

    const botList = await friends.botApi(a, 'GET', '/friends');
    const me = botList.find((f) => f.id === U(user));
    expect(me, '봇 친구 목록의 사람 줄').toBeTruthy();
    expect(me.isFavorite).toBe(false);
});

test('A13-E-014 친구 줄 차단 → 친구 목록에서 사라지고 차단 탭에 그 닉네임', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 1);
    await K.showList(page);
    await K.friendRow(page, U(a)).getByRole('button', { name: `${a.nickname} 차단`, exact: true }).click();

    await expect(K.friendRow(page, U(a))).toHaveCount(0);
    await K.openTab(page, '차단 목록');
    await expect(K.blockedList(page)).toContainText(a.nickname);
});

test('A13-E-015 별 켠 친구 차단 → 차단 탭에서 풀기 → 친구 목록 즐겨찾기 폴더에 다시', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 1);
    await setFavorite(user, a, true);
    await K.showList(page);
    await K.openFolder(page, '즐겨찾기');
    await K.friendRow(page, U(a)).getByRole('button', { name: `${a.nickname} 차단`, exact: true }).click();
    await expect(K.friendRow(page, U(a))).toHaveCount(0);

    await K.openTab(page, '차단 목록');
    await K.blockedList(page).getByRole('button', { name: `${a.nickname} 차단 해제`, exact: true }).click();
    await expect(K.blockedList(page).getByText(a.nickname)).toHaveCount(0);

    await K.showList(page);
    const fav = await K.openFolder(page, '즐겨찾기');
    await expect(fav.locator(`li[data-friend-id="${U(a)}"]`)).toBeVisible();
});

test('A13-E-016 봇이 나를 차단 → 새로고침 없이 내 친구 목록에서 봇 줄 사라짐', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 1);
    await K.showList(page);
    await expect(K.friendRow(page, U(a))).toBeVisible();

    await friends.botApi(a, 'POST', '/friends/blocks', { targetId: U(user) });
    await expect(K.friendRow(page, U(a))).toHaveCount(0);
});

test('A13-E-017 봇 신청이 받은 신청 탭에 있음 → 사람이 그 봇을 차단(POST /friends/blocks) → 새로고침 없이 받은 신청 탭 0', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);
    await K.openTab(page, '요청 수락');
    await expect(K.requestRow(page, bot.nickname)).toHaveCount(1);

    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(bot) });
    await expect(K.panel(page).locator('li[data-request-id]')).toHaveCount(0);
});

test('A13-E-018 차단 0명 → 차단 탭 "차단한 사용자가 없습니다." 읽힘', async ({ user }) => {
    const page = user.page;
    await K.openTab(page, '차단 목록');
    await expectReadable(K.blockedList(page).getByText(TEXT.noBlocks, { exact: true }));
});

test('A13-E-019 서로 차단 중 사람이 풀기 → 친구 목록에 봇 없음 (상대 차단은 남음)', async ({ user, bots }) => {
    const page = user.page;
    const [a] = await botFriends(bots, user, 1);
    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(a) });
    await friends.botApi(a, 'POST', '/friends/blocks', { targetId: U(user) });

    await K.openTab(page, '차단 목록');
    await K.blockedList(page).getByRole('button', { name: `${a.nickname} 차단 해제`, exact: true }).click();
    await expect(K.blockedList(page).getByText(a.nickname)).toHaveCount(0);

    await K.showList(page);
    await expect(K.friendRow(page, U(a))).toHaveCount(0);
});

test('A13-E-020 차단 탭 새로고침 단추 이름 "차단 목록 새로고침", 목록 이름 "차단한 사용자"', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(bot) });
    await K.openTab(page, '차단 목록');

    await expect(K.panel(page).getByRole('button', { name: '차단 목록 새로고침', exact: true })).toBeVisible();
    await expect(K.panel(page).getByRole('list', { name: '차단한 사용자', exact: true })).toBeVisible();
    await expect(K.blockedList(page)).toContainText(bot.nickname);
});
