'use strict';

// 판 끝 뒤 남긴 방장 칸과 초대 보내기 브라우저 시험 (PC) — 6명 판(정원 6) 끝, 원래 방장 봇은 결과 화면, 사람·봇 4가 "대기방으로" → 방장 칸 때문에 가득 차 초대 못 보냄, 원래 방장이 "로비로" 가면 보내짐
// 목록 A13-친구-알림-초대.md 번호 A13-E-035·036 (임시 3, 결정「대기방으로」), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-invite-host-seat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const H = require('../result/_a08-hard-kit');
const K = require('./_a13-kit');

const { TEXT } = K;

/**
 * 친구 봇 하나 맺고 → 봇 방장 6명 판(정원 6, 사람 시민·맨 뒤 봇 광대) → 봇 표로 광대 처형해 판 끝
 * → 사람·방장 아닌 봇 4가 "대기방으로" (방장 봇은 결과 화면에 남음) → { t, host, friend }
 */
async function roomWithHeldHostSeat(table, bots, user) {
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    const { t, joker, host } = await H.seatTable(table, [user], 5, { ...K.ROOMY, maxPlayers: 6 });
    await H.voteOutJoker(t, joker);
    await H.allAtResult([user]);
    await H.pressReturn(user.page);
    for (const bot of t.bots.filter((b) => b !== host)) await H.botReturn(bot, t.gameId);
    // 사람 + 봇 4 = 5명, 남긴 방장 칸 1 → 정원 6이 다 참
    await H.expectParty(user.page, 5);
    await expect(H.hostSeat(user.page)).toBeVisible();
    return { t, host, friend };
}

test('A13-E-035 6명 판(정원 6) 끝, 봇 방장은 결과 화면, 사람·봇 4 "대기방으로" → 사람이 친구 초대 → "방이 가득 차 초대를 보낼 수 없습니다." 읽힘 @game @smoke', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const { friend } = await roomWithHeldHostSeat(table, bots, user);

    const modal = await K.inviteFromModal(page, friend.nickname);
    await expectReadable(modal.getByText(TEXT.roomFull, { exact: true }));
});

test('A13-E-036 위 방(6명 판, 정원 6)에서 원래 방장 봇이 "로비로" → 사람이 친구 초대 → 그 줄 "초대중" @game', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const { t, host, friend } = await roomWithHeldHostSeat(table, bots, user);

    await H.botToLobby(host, t.gameId);
    await expect(H.hostSeat(page)).toHaveCount(0);
    const modal = await K.inviteFromModal(page, friend.nickname);
    await expect(modal.getByRole('button', { name: `${friend.nickname} 초대 보내는 중`, exact: true })).toContainText(TEXT.inviting);
});
