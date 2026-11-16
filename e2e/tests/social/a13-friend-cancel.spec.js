'use strict';

// 친구 신청 취소 브라우저 시험 (PC, 2026-11-16 새로 만든 기능) — 보낸 신청이 친구 추가 탭에 보임·취소하면 사라짐·받은 쪽에서도 사라짐·취소 뒤 다시 신청·상대가 받으면 보낸 줄이 사라짐
// 목록 A13-친구-알림-초대.md 번호 A13-E-501~505 (결정 둘째 12), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-friend-cancel.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT, nickOf } = K;

// 친구 추가 탭 검색하지 않을 때 보이는 보낸 신청 목록·그 사람 줄·취소 단추
const sentList = (page) => K.panel(page).getByRole('list', { name: '보낸 친구 신청' });
const sentRow = (page, name) => K.panel(page).locator('li[data-outgoing-request-id]').filter({ hasText: name });
const cancelButton = (page, name) => sentRow(page, name).getByRole('button', { name: `${name}에게 보낸 친구 신청 취소`, exact: true });

/** 봇을 찾아 화면으로 신청 → 검색어 지움 (보낸 신청 목록이 보이게) → 검색 칸 */
async function sendThenClear(page, bot) {
    const box = await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    await K.sendButton(row, bot.nickname).click();
    await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    await box.fill('');
    return box;
}

test('A13-E-501 봇을 검색해 신청 → 검색어 지움 → "보낸 신청 (1)"과 봇 닉네임 줄 보임 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await sendThenClear(page, bot);

    await expect(K.panel(page).getByText('보낸 신청 (1)', { exact: true })).toBeVisible();
    await expect(sentList(page)).toContainText(bot.nickname);
});

test('A13-E-502 보낸 신청 줄 "취소" → 줄 없음, 새로고침해도 없음', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await sendThenClear(page, bot);
    await cancelButton(page, bot.nickname).click();
    await expect(sentRow(page, bot.nickname)).toHaveCount(0);

    await ui.gotoLobby(page);
    await K.openTab(page, '친구 추가');
    await expect(K.panel(page).getByRole('searchbox', { name: '친구 검색' })).toBeVisible();
    await expect(sentRow(page, bot.nickname)).toHaveCount(0);
});

test('A13-E-503 A가 B에게 신청 → B 요청 수락 탭에 A 줄 → A가 취소 → B 화면에서 새로고침 없이 A 줄 없음 (사람 2)', async ({ players }) => {
    const a = await players.add();
    const b = await players.add();
    await friends.api(a, 'POST', '/friends/requests', { receiverId: U(b) });
    await K.openTab(b.page, '요청 수락');
    await expect(K.requestRow(b.page, nickOf(a))).toHaveCount(1);

    await K.openTab(a.page, '친구 추가');
    await cancelButton(a.page, nickOf(b)).click();
    await expect(sentRow(a.page, nickOf(b))).toHaveCount(0);
    await expect(K.requestRow(b.page, nickOf(a))).toHaveCount(0);
});

test('A13-E-504 취소 → 같은 닉네임 검색 → 신청 단추가 켜져 있고 다시 신청 됨', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await sendThenClear(page, bot);
    await cancelButton(page, bot.nickname).click();
    await expect(sentRow(page, bot.nickname)).toHaveCount(0);

    await K.search(page, bot.nickname);
    const row = K.candidateRow(page, U(bot));
    const send = K.sendButton(row, bot.nickname);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(row.getByRole('button', { name: TEXT.sentDone })).toBeVisible();
    await expect.poll(async () => (await K.requestStatuses(user, bot)).at(-1), { message: 'DB 마지막 신청 상태' }).toBe('PENDING');
});

test('A13-E-505 보낸 신청을 봇이 받음 → 새로고침 없이 보낸 신청 줄 없음, 친구 목록에 봇 줄', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await sendThenClear(page, bot);
    await expect(sentRow(page, bot.nickname)).toHaveCount(1);

    const incoming = await friends.botApi(bot, 'GET', '/friends/requests/incoming');
    const request = incoming.find((r) => r.id === U(user));
    expect(request, '봇이 받은 친구 신청').toBeTruthy();
    await friends.botApi(bot, 'PUT', `/friends/requests/${request.request_id}/accept`);

    await expect(sentRow(page, bot.nickname)).toHaveCount(0);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toBeVisible();
});
