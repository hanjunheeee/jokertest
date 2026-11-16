'use strict';

// 탈주 막힘 중 초대·둘러보기 어려운 브라우저 시험 (PC, 사람 2명) — 60초로 빠진 사람은 초대 수락도 탈주 글로 막힘, 막힘 중에도 친구 창·공개 방 목록은 열림
// 목록 A09-끊김-나가기-탈주.md A09-H-050·054 — 모이는지만: npx playwright test --list tests/ingame/a09-desertion-invite.spec.js
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { api, makeFriends } = require('../../helpers/friends');
const { openFriendPanel, openTab } = require('../lobby/lobbyHelpers');
const { openRoomList } = require('../room/roomHelpers');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick } = H;

test('A09-H-050 6명 판(사람 2 + 봇 4) ㄴ이 탭을 닫고 손잡이 탈락 → 처형된 뒤 나온 ㄱ이 새 방에서 ㄴ 초대 → ㄴ 수락 → 초대 줄에 탈주 글 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await H.openPeople(user, players, 2);
    // 친구는 판에 들어가기 전에 맺어 둠
    await makeFriends(a, b);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    const since = Date.now();
    await b.page.close();
    await K.droppedAt(t, U(b), since);
    await K.expire(t, U(b));

    // ㄱ은 봇 표로 처형 → 사망 창 "게임 나가기"(탈주 아님) → 새 방 → ㄴ 초대
    await H.execute(t, U(a));
    await K.pressDeadExit(a.page, { accept: true });
    await expect(a.page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    await A.createRoomFromLobby(a);
    await api(a, 'POST', '/friends/invites', { receiverId: U(b), creationKey: crypto.randomUUID() });

    // ㄴ 새 탭: 로비 → 친구 창 "게임 초대" → 수락 → 거절 글은 그 초대 줄 안에
    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await ui.gotoLobby(tab);
    await openFriendPanel(tab);
    await openTab(tab, '게임 초대');
    const row = tab.getByRole('list', { name: '받은 게임 초대' }).locator('[data-invite-id]').filter({ hasText: nick(a) });
    await row.getByRole('button', { name: '초대 수락' }).click();
    const refusal = row.locator('[data-invite-error]');
    await expect(refusal).toHaveText(K.COOLDOWN_FIRST);
    await expectReadable(refusal);
    await expect(tab).not.toHaveURL(/\/game-matching/);
});

test('A09-H-054 6명 판(사람 2 + 봇 4) 산 채로 나간 ㄴ, 막힘 중에도 친구 창·공개 방 목록은 열림 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await K.leaveAlive(b.page);
    // 지금 막힘 중인지 먼저 (방 만들기가 탈주 글로 거절)
    expect(await K.createRoomAlert(b.page)).toMatch(K.COOLDOWN_FIRST);

    await ui.gotoLobby(b.page);
    const panel = await openFriendPanel(b.page);
    await expectReadable(panel.getByRole('tablist', { name: '친구 목록 탭' }), { contrast: false });
    await openRoomList(b.page);
    await expectReadable(b.page.getByRole('region', { name: '공개 방 목록' }), { contrast: false });
    // ㄱ 판은 그대로
    expect((await t.state()).phase).not.toBe('ENDED');
    await expect(a.page).toHaveURL(/\/ingame/);
});
