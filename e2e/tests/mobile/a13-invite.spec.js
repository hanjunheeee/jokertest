'use strict';

// 모바일 게임 초대 브라우저 시험 — 받은 초대 알림 글·거절·판 끝 뒤 남긴 방장 칸 때문에 초대 못 보냄·방이 없어지면 받은 초대 줄 사라짐
// 목록 A13-친구-알림-초대.md 번호 A13-E-081~084 (쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-invite.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const H = require('../result/_a08-hard-kit');
const K = require('../social/_a13-kit');

const { TEXT } = K;

/** 친구 봇 하나 + 그 봇 방(정원 6) + 사람에게 보낸 초대 → { bot, invite } */
async function invitedBy(bots, user) {
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    const room = await K.botRoom(bot);
    const invite = await K.botInvite(bot, user, room);
    return { bot, invite };
}

test('A13-E-081 모바일 봇 방장(정원 6) 초대 → 알림 시트 "<봇> 님이 대기방으로 초대했습니다." 읽힘 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const { bot } = await invitedBy(bots, user);

    await K.openNotices(page);
    await expectReadable(K.noticeRowOf(page, TEXT.inviteBody(bot.nickname)).getByText(TEXT.inviteBody(bot.nickname), { exact: true }));
});

test('A13-E-082 모바일 받은 초대(정원 6) 거절 → 그 초대 줄(수락할 수 있는 줄) 없음, DB DECLINED', async ({ user, bots }) => {
    const page = user.page;
    const { bot, invite } = await invitedBy(bots, user);
    await K.openTab(page, '게임 초대');
    const rows = K.liveInviteRows(page, bot.nickname);
    await expect(rows).toHaveCount(1);

    await rows.getByRole('button', { name: '초대 거절', exact: true }).click();
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'DECLINED');
});

test('A13-E-083 모바일 6명 판(정원 6) 끝, 원래 방장 봇은 결과 화면 → 모바일 사람 대기방에서 친구 초대 → "방이 가득 차 초대를 보낼 수 없습니다." 읽힘 @game', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    const { t, joker, host } = await H.seatTable(table, [user], 5, { ...K.ROOMY, maxPlayers: 6 });
    await H.voteOutJoker(t, joker);
    await H.allAtResult([user]);
    await H.pressReturn(page);
    for (const bot of t.bots.filter((b) => b !== host)) await H.botReturn(bot, t.gameId);
    await H.expectParty(page, 5);

    await K.inviteFromModal(page, friend.nickname);
    await expectReadable(page.getByText(TEXT.roomFull, { exact: true }));
});

test('A13-E-084 모바일 받은 초대(정원 6) → 봇이 방을 지움 → 그 초대 줄 없음', async ({ user, bots }) => {
    const page = user.page;
    const { bot, invite } = await invitedBy(bots, user);
    await K.openTab(page, '게임 초대');
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(1);

    const reply = await bot.request('delete_room', {});
    expect(reply?.ok, `방 지우기 답 ${JSON.stringify(reply)}`).toBe(true);
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'CANCELLED');
});
