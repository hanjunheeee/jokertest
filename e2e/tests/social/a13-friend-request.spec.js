'use strict';

// 친구 신청 브라우저 시험 (PC) — 찾아서 신청·받기·거절·차단한 사람은 검색에 없음·서로 같은 순간 신청·실패 글은 그 줄에만·검색어 바꾸면 옛 결과 숨김·21번째 신청 막힘
// 목록 A13-친구-알림-초대.md 번호 A13-E-001~010 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-friend-request.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT } = K;

/** 봇이 받은 신청 중 그 사람이 보낸 것 받기 */
async function botAccepts(bot, person) {
    const incoming = await friends.botApi(bot, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === U(person));
    expect(row, '봇이 받은 친구 신청').toBeTruthy();
    await friends.botApi(bot, 'PUT', `/friends/requests/${row.request_id}/accept`);
}

test('A13-E-001 친구 추가 탭에서 봇 닉네임 검색 → 신청 → 봇이 받음 → 새로고침 없이 친구 목록에 봇 줄 @smoke', async ({ user, bots }) => {
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

test('A13-E-002 봇이 친구 신청 → 알림 창 "새 친구 요청"·"<봇> 님이 친구 요청을 보냈습니다." 읽힘, 받은 신청 탭에 봇 줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);

    await K.openNotices(page);
    const row = K.noticeRowOf(page, TEXT.requestBody(bot.nickname));
    await expectReadable(row.getByText(TEXT.requestTitle, { exact: true }));
    await expectReadable(row.getByText(TEXT.requestBody(bot.nickname), { exact: true }));
    await K.closeNotices(page);

    await K.openTab(page, '요청 수락');
    await expect(K.requestRow(page, bot.nickname)).toHaveCount(1);
});

test('A13-E-003 받은 신청 수락 → 받은 신청 0, 친구 목록에 봇', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);
    await K.openTab(page, '요청 수락');
    await K.panel(page).getByRole('button', { name: `${bot.nickname} 수락`, exact: true }).click();

    await expect(K.requestRow(page, bot.nickname)).toHaveCount(0);
    await expect(K.panel(page).getByText(TEXT.noIncoming, { exact: true })).toBeVisible();
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});

test('A13-E-004 받은 신청 거절 → 줄 없음, 친구 목록에 없음, DB 신청 DECLINED', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.botRequest(bot, user);
    await K.openTab(page, '요청 수락');
    await K.panel(page).getByRole('button', { name: `${bot.nickname} 거절`, exact: true }).click();

    await expect(K.requestRow(page, bot.nickname)).toHaveCount(0);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toHaveCount(0);
    await expect.poll(() => K.requestStatuses(bot, user), { message: 'DB 신청 상태' }).toEqual(['DECLINED']);
});

test('A13-E-005 내가 보낸 신청을 봇이 받음 → 열어 둔 친구 목록에 새로고침 없이 봇 줄이 생김', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toHaveCount(0);

    await friends.api(user, 'POST', '/friends/requests', { receiverId: U(bot) });
    await botAccepts(bot, user);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});

test('A13-E-006 내가 차단한 봇은 친구 추가 검색에 안 나옴 → "검색 결과가 없습니다."', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(bot) });

    await K.search(page, bot.nickname);
    await expect(K.candidateRow(page, U(bot))).toHaveCount(0);
    await expect(K.panel(page).getByText(TEXT.noResults, { exact: true })).toBeVisible();
});

test('A13-E-007 서로 같은 순간 신청 → 사람 쪽이 지면 그 줄 아래 "이미 친구 신청 중입니다." 읽힘, DB 기다리는 신청 1줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await expect(row).toBeVisible();

    // 사람이 신청 누르는 순간 봇도 사람에게 신청
    const [, botTry] = await Promise.allSettled([K.sendButton(row, bot.nickname).click(), K.botRequest(bot, user)]);
    await expect.poll(async () => (await K.pendingBetween(user, bot)).length, { message: '기다리는 신청 줄 수' }).toBe(1);
    const [pending] = await K.pendingBetween(user, bot);

    if (pending.requester_id === U(bot)) {
        // 사람이 짐 → 실패 글이 그 줄에
        await expectReadable(row.getByText(TEXT.pendingDup, { exact: true }));
    } else {
        // 사람이 이김 → 봇 신청은 거절, 사람 줄은 "신청 완료"
        expect(botTry.status, '봇 신청은 거절됨').toBe('rejected');
        await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    }
    await expect.poll(async () => (await K.pendingBetween(user, bot)).length).toBe(1);
});

test('A13-E-008 봇 A는 이미 나에게 대기 신청, 봇 B는 처음 → 둘 다 신청 → A 줄에만 실패 글, B 줄 "신청 완료"', async ({ user, bots }) => {
    const page = user.page;
    const { prefix, list: [a, b] } = await K.spawnNamedBots(bots, 2);
    await K.botRequest(a, user);

    await K.search(page, prefix);
    const rowA = K.candidateRow(page, U(a));
    const rowB = K.candidateRow(page, U(b));
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();
    await K.sendButton(rowA, a.nickname).click();
    await K.sendButton(rowB, b.nickname).click();

    await expect(rowA.getByText(TEXT.pendingDup, { exact: true })).toBeVisible();
    await expect(rowB.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    await expect(rowB.getByText(TEXT.pendingDup, { exact: true })).toHaveCount(0);
});

test('A13-E-009 검색 뒤 검색 칸 글만 바꿈(엔터 안 누름) → 옛 결과 줄 없음', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    const box = await K.search(page, bot.nickname);
    await expect(K.candidateRow(page, U(bot))).toBeVisible();

    await box.fill(`${bot.nickname}x`);
    await expect(K.panel(page).locator('li[data-candidate-id]')).toHaveCount(0);
    await expect(K.panel(page).getByText(TEXT.noResults, { exact: true })).toHaveCount(0);
});

test('A13-E-010 API로 20번 신청 뒤 화면에서 21번째 → "친구 신청이 너무 많습니다. 잠시 후 다시 시도해주세요." 보임', async ({ user, accounts, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const targets = await accounts.createMany(20);
    for (const target of targets) await friends.api(user, 'POST', '/friends/requests', { receiverId: target.uuid });
    const [bot] = await bots.spawn(1);

    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await K.sendButton(row, bot.nickname).click();
    await expectReadable(row.getByText(TEXT.requestRate, { exact: true }));
});
