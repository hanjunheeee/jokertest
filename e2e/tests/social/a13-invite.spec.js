'use strict';

// 게임 초대 브라우저 시험 (PC) — 로비 친구 줄엔 초대 못 함·대기방에서 보낸 초대가 친구에게 감·받은 초대 알림 글·거절·판 중 친구 초대 거절 글·차단한 친구는 초대 창에 없음·방이 없어지거나 판이 시작되면 받은 초대가 끝남·두 방 초대·새로고침
// 목록 A13-친구-알림-초대.md 번호 A13-E-026~029·031·032·037~040 (쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-invite.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const { createRoomUi } = require('../room/roomHelpers');
const K = require('./_a13-kit');

const { U, TEXT } = K;

/** 친구 봇 하나 + 그 봇 방(정원 6) + 사람에게 보낸 초대 → { bot, room, invite } */
async function invitedBy(bots, user, settings = {}) {
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    const room = await K.botRoom(bot, settings);
    const invite = await K.botInvite(bot, user, room);
    return { bot, room, invite };
}

test('A13-E-026 대기방 없이 로비 친구 목록 → 친구 줄 초대 단추는 없거나 꺼짐 (초대 못 보냄) @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    const row = K.friendRow(page, U(bot));
    await expect(row).toBeVisible();

    const button = row.getByRole('button', { name: `${bot.nickname} 게임 초대`, exact: true });
    if (await button.count() > 0) await expect(button).toBeDisabled();
    else await expect(button).toHaveCount(0);
});

test('A13-E-027 사람 방장 대기방(정원 6) 친구 초대 창에서 봇 친구 초대 → 봇이 받은 초대 1개, 봇 알림 "게임 초대"', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await createRoomUi(user, { maxPlayers: 6 });

    await K.inviteFromModal(page, bot.nickname);
    await expect.poll(async () => (await friends.botApi(bot, 'GET', '/friends/invites'))?.invites?.length ?? 0, { message: '봇이 받은 초대 수' }).toBe(1);
    const notices = await friends.botApi(bot, 'GET', '/notifications');
    const invites = notices.filter((n) => n.type === 'game-invite');
    expect(invites, '봇 게임 초대 알림').toHaveLength(1);
    expect(invites[0].title).toBe(TEXT.inviteTitle);
});

test('A13-E-028 봇 방장(정원 6)이 사람 초대 → 알림 창 "게임 초대"·"<봇> 님이 대기방으로 초대했습니다." 읽힘', async ({ user, bots }) => {
    const page = user.page;
    const { bot } = await invitedBy(bots, user);

    await K.openNotices(page);
    const row = K.noticeRowOf(page, TEXT.inviteBody(bot.nickname));
    await expectReadable(row.getByText(TEXT.inviteTitle, { exact: true }));
    await expectReadable(row.getByText(TEXT.inviteBody(bot.nickname), { exact: true }));
});

test('A13-E-029 받은 초대(정원 6) 거절 → 그 초대 줄(수락할 수 있는 줄) 없음, DB 초대 DECLINED', async ({ user, bots }) => {
    const page = user.page;
    const { bot, invite } = await invitedBy(bots, user);
    await K.openTab(page, '게임 초대');
    const rows = K.liveInviteRows(page, bot.nickname);
    await expect(rows).toHaveCount(1);

    await rows.getByRole('button', { name: '초대 거절', exact: true }).click();
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'DECLINED');
});

test('A13-E-031 사람 방장 대기방(정원 6)에서 다른 6명 판 중인 친구 봇 초대 → "지금은 상대를 초대할 수 없습니다." 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    // 친구 봇이 든 봇끼리 6명 판 (광대는 맨 뒤 봇)
    const t = await table.setup({ humans: [], bots: 6, roles: ({ bots }) => ({ [U(bots[5])]: 'JOKER', [U(bots[1])]: 'CITIZEN' }) });
    const friend = t.bots[1];
    await expect.poll(async () => (await t.state())?.phase, { message: '봇 판 시작' }).not.toBeUndefined();
    await K.befriendBot(user, friend);
    await createRoomUi(user, { maxPlayers: 6 });

    const modal = await K.inviteFromModal(page, friend.nickname);
    await expectReadable(modal.getByText(TEXT.inviteBusy, { exact: true }));
});

test('A13-E-032 봇 친구를 차단 → 대기방(정원 6) 친구 초대 창에 그 줄 없음', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await friends.api(user, 'POST', '/friends/blocks', { targetId: U(bot) });
    await createRoomUi(user, { maxPlayers: 6 });

    const modal = await K.openInviteModal(page);
    await expect(modal.getByText('초대할 친구가 없습니다.', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: `${bot.nickname} 게임 초대`, exact: true })).toHaveCount(0);
});

test('A13-E-037 봇 방장(정원 6) 초대를 받은 뒤 봇이 방을 지움 → 새로고침 없이 그 초대 줄 없음', async ({ user, bots }) => {
    const page = user.page;
    const { bot, invite } = await invitedBy(bots, user);
    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(1);

    const reply = await bot.request('delete_room', {});
    expect(reply?.ok, `방 지우기 답 ${JSON.stringify(reply)}`).toBe(true);
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'CANCELLED');
});

test('A13-E-038 봇 방(정원 6, 봇 5)에서 받은 초대 → 봇들이 5명 판 시작 → 그 초대 줄 없음 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const list = await bots.spawn(5);
    const host = list[0];
    await K.befriendBot(user, host);
    const room = await K.botRoom(host, { maxPlayers: 6 });
    for (const bot of list.slice(1)) await bot.joinByCode(room.roomCode);
    const invite = await K.botInvite(host, user, room);
    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, host.nickname)).toHaveCount(1);

    // 직업 고정 (광대 = 맨 뒤 봇) → 준비 → 시작
    const live = await e2e.roomOf(U(host));
    for (const bot of list) await bot.setReady(live.roomId, live.settingsVersion);
    await e2e.setRoles({ [U(list[4])]: 'JOKER', [U(host)]: 'CITIZEN' }, { roomId: live.roomId });
    await host.startGame(live.roomId, live.settingsVersion);

    await expect(K.liveInviteRows(page, host.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'CANCELLED');
});

test('A13-E-039 봇 방장 둘이 각자 방에서 초대 → 받은 초대 두 줄, 보낸 사람 둘', async ({ user, bots }) => {
    const page = user.page;
    const first = await invitedBy(bots, user);
    const second = await invitedBy(bots, user, { maxPlayers: 8 });
    await K.openTab(page, '게임 초대');

    await expect(K.liveInviteRows(page, first.bot.nickname)).toHaveCount(1);
    await expect(K.liveInviteRows(page, second.bot.nickname)).toHaveCount(1);
    await expect(K.inviteList(page).locator('li[data-invite-status="PENDING"]')).toHaveCount(2);
});

test('A13-E-040 받은 초대(정원 6) → 새로고침 → 그 초대 줄 그대로 (수락·거절 단추 있음)', async ({ user, bots }) => {
    const page = user.page;
    const { bot } = await invitedBy(bots, user);
    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(1);

    await ui.gotoLobby(page);
    await K.openTab(page, '게임 초대');
    const rows = K.liveInviteRows(page, bot.nickname);
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole('button', { name: '초대 거절', exact: true })).toBeVisible();
});
