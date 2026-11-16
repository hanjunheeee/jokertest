'use strict';

// 게임 초대 어려움 브라우저 시험 (PC, 사람 2~3) — 탈주한 사람이 받은 초대 거절, 판 끝 뒤 남긴 방장 칸과 초대 보내기, 판 중엔 초대 못 받고 끝나면 받음
// 목록 A13-친구-알림-초대.md 번호 A13-H-007~009 (결정「탈주 벌」③·「기다림」·「대기방으로」, 임시 3, 01글 1-3), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-invite.hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const { createRoomUi, hostGame, waitResult } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');
const K = require('./_a13-kit');

const { U, TEXT, nickOf } = K;

/** 죽은 사람이 "사망 후 선택" 창의 "게임 나가기" → 판 화면 밖으로 (확인 창은 확인) */
async function leaveDead(page) {
    const dead = page.getByRole('dialog', { name: '사망 후 선택' });
    const accept = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', accept);
    try {
        await expect(async () => {
            await ui.closeOverlays(page, { keepWatching: false });
            // 처형 뒤 추방 연출이 덮고 있으면 눌러 넘김
            const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
            if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
            await dead.getByRole('button', { name: '게임 나가기', exact: true }).click({ timeout: 2000 });
        }).toPass({ timeout: 60_000 });
        await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    } finally {
        page.off('dialog', accept);
    }
}

test('A13-H-007 6명 판(사람 2 + 봇 4): B 처형돼 나감 → A 산 채로 나감(탈주) → B가 자기 방에서 A 초대 → A 알림 줄 → A 거절 → B 화면 그 줄 "초대중" 그대로 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(420_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    const t = await table.setup({
        humans: [a, b], bots: 4, settings: K.ROOMY,
        roles: ({ bots }) => ({ [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN', [U(bots[3])]: 'JOKER' }),
    });
    const start = await t.state();
    expect(start.players.find((p) => p.uuid === U(t.bots[3]))?.role, '맨 뒤 봇 광대').toBe('JOKER');
    await ui.readRoleReveal(a.page);
    await ui.readRoleReveal(b.page);

    // 봇 4표 > 기권 2 → B 재판·처형 (밤엔 아무도 안 죽임)
    await t.assertBotsCanExecute(U(b));
    t.playBots({ dayVote: U(b), tribunal: 'GUILTY', night: 'skip' });
    await t.advanceUntil((s) => s.players.find((p) => p.uuid === U(b))?.alive === false, { stepDelayMs: 1200, maxSteps: 60 });
    await t.stopBots();
    await leaveDead(b.page);
    await H.leaveGameUi(a.page);
    await ui.gotoLobby(a.page);
    await ui.gotoLobby(b.page);

    await createRoomUi(b, { maxPlayers: 6 });
    const modal = await K.inviteFromModal(b.page, nickOf(a));
    const inviting = modal.getByRole('button', { name: `${nickOf(a)} 초대 보내는 중`, exact: true });
    await expect(inviting).toContainText(TEXT.inviting);

    await K.openNotices(a.page);
    await expect(K.noticeRowOf(a.page, TEXT.inviteBody(nickOf(b)))).toHaveCount(1);
    await K.closeNotices(a.page);
    await K.openTab(a.page, '게임 초대');
    await K.liveInviteRows(a.page, nickOf(b)).getByRole('button', { name: '초대 거절', exact: true }).click();
    await expect(K.liveInviteRows(a.page, nickOf(b))).toHaveCount(0);

    await expect(inviting).toContainText(TEXT.inviting);
});

test('A13-H-008 6명 판(사람 3 + 봇 3, 정원 6) 끝, 원래 방장 ㄱ 결과 화면, ㄴ·ㄷ·봇 3 대기방 → ㄴ 초대 "가득" → ㄱ "로비로" → ㄴ 초대 → 친구 봇 수락 → 명단 6 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await H.openHumans(players, 3);
    const botList = await bots.spawn(3);
    const [friend] = await bots.spawn(1);
    await K.befriendBot(b, friend);

    // 광대 2 (ㄷ + 셋째 봇) → 셋째 봇이 두 밤에 봇 둘을 암살 → 광대 승 (아무도 안 나감)
    const first = H.rolesFor([a, b, c], [c, botList[2]]);
    const t = await hostGame({ host: a, guests: [b, c], botList, roles: first, settings: { maxPlayers: 6, custom: { JOKER: 2 } } });
    await H.expectRoles(t.gameId, first);
    await H.killByNight(t, [botList[2]], [U(botList[0]), U(botList[1])]);
    await H.allAtResult([a, b, c]);
    await H.pressReturn(b.page);
    await H.pressReturn(c.page);
    for (const bot of botList) await H.botReturn(bot, t.gameId);
    await H.expectParty(b.page, 5);
    await expect(H.hostSeat(b.page)).toBeVisible();

    const modal = await K.inviteFromModal(b.page, friend.nickname);
    await expect(modal.getByText(TEXT.roomFull, { exact: true })).toBeVisible();

    await H.leaveToLobby(a.page);
    await expect(H.hostSeat(b.page)).toHaveCount(0);
    await K.inviteFromModal(b.page, friend.nickname);
    let invite = null;
    await expect.poll(async () => {
        invite = (await friends.botApi(friend, 'GET', '/friends/invites'))?.invites?.[0] ?? null;
        return invite !== null;
    }, { message: '친구 봇에게 초대가 옴', timeout: 15_000 }).toBe(true);
    const accepted = await friend.request('accept_game_invite', { inviteId: invite.inviteId });
    expect(accepted?.ok, `초대 수락 답 ${JSON.stringify(accepted)}`).toBe(true);
    await H.expectParty(b.page, 6);
});

test('A13-H-009 B가 5명 판 중(B + 봇 4)일 때 A 초대 → "지금은 상대를 초대할 수 없습니다." → B 판 끝·로비 → A 초대 → B 알림 줄 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await createRoomUi(a, { maxPlayers: 6 });
    const t = await table.setup({
        humans: [b], bots: 4, settings: K.ROOMY,
        roles: ({ bots }) => ({ [U(b)]: 'CITIZEN', [U(bots[3])]: 'JOKER' }),
    });
    await ui.readRoleReveal(b.page);

    const modal = await K.inviteFromModal(a.page, nickOf(b));
    await expect(modal.getByText(TEXT.inviteBusy, { exact: true })).toBeVisible();

    // 광대 봇이 나가 판 끝 → B 결과 화면 → "로비로"
    await K.jokerQuits(t);
    await waitResult(b.page);
    await H.leaveToLobby(b.page);

    await K.inviteFromModal(a.page, nickOf(b));
    await K.openNotices(b.page);
    await expect(K.noticeRowOf(b.page, TEXT.inviteBody(nickOf(a)))).toHaveCount(1);
});
