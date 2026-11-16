'use strict';

// 탈주 대기 중 게임 초대 브라우저 시험 (PC) — 6명 판에서 산 채로 나가 탈주 대기인 사람도 친구 봇 초대를 받고 거절할 수 있음
// 목록 A13-친구-알림-초대.md 번호 A13-E-033·034 (결정「탈주 벌」③ 막는 것은 수락만), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-invite-desertion.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const H = require('../result/_a08-hard-kit');
const K = require('./_a13-kit');

const { TEXT } = K;

/** 친구 봇 하나 맺고 → 사람이 6명 판(광대 = 맨 뒤 봇)에서 산 채로 나가 로비로 → 친구 봇이 자기 방(정원 6)에서 초대 → { bot, invite } */
async function desertThenInvited(table, bots, user) {
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.seatGame(table, user, 6, { toDay: false });
    await H.leaveGameUi(user.page);
    await ui.gotoLobby(user.page);
    const room = await K.botRoom(bot);
    const invite = await K.botInvite(bot, user, room);
    return { bot, invite };
}

test('A13-E-033 6명 판에서 산 채로 나가 탈주 대기 → 로비 → 친구 봇이 자기 방에서 초대 → 알림 줄 "게임 초대" @game @smoke', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { bot } = await desertThenInvited(table, bots, user);

    await K.openNotices(page);
    const row = K.noticeRowOf(page, TEXT.inviteBody(bot.nickname));
    await expect(row.getByText(TEXT.inviteTitle, { exact: true })).toBeVisible();
});

test('A13-E-034 탈주 대기 중 받은 초대(6명 판 뒤) 거절 → 그 초대 줄 없음, DB DECLINED @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { bot, invite } = await desertThenInvited(table, bots, user);

    await K.openTab(page, '게임 초대');
    const rows = K.liveInviteRows(page, bot.nickname);
    await expect(rows).toHaveCount(1);
    await rows.getByRole('button', { name: '초대 거절', exact: true }).click();
    await expect(K.liveInviteRows(page, bot.nickname)).toHaveCount(0);
    await K.waitInviteStatus(invite.inviteId, 'DECLINED');
});
