'use strict';

// 초대 기다리는 중 차단·끊기 어려움 브라우저 시험 (PC, 사람 2) — A 대기방에서 B를 초대한 뒤 B가 A를 차단(또는 끊음)하면 B의 받은 초대가 끝나고 A 초대 창에서 B가 사라짐
// 목록 A13-친구-알림-초대.md 번호 A13-H-003·502 (DB글 영역 소개 6번·game_invites, 결정 둘째 12), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-block.hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const friends = require('../../helpers/friends');
const { createRoomUi } = require('../room/roomHelpers');
const K = require('./_a13-kit');

const { U, nickOf } = K;

test('A13-H-003 A 대기방(정원 6)에서 B 초대 → B가 A 차단 → B 받은 초대 줄 사라짐, A 초대 창에서 B 사라짐(새로고침 없이), DB 초대 CANCELLED·BLOCKED @hard @smoke', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await createRoomUi(a, { maxPlayers: 6 });

    // A가 친구 초대 창에서 B 초대 → B 받은 초대 탭에 그 줄
    const modal = await K.inviteFromModal(a.page, nickOf(b));
    await expect(modal.getByRole('button', { name: `${nickOf(b)} 초대 보내는 중`, exact: true })).toBeVisible();
    await K.openTab(b.page, '게임 초대');
    await expect(K.liveInviteRows(b.page, nickOf(a))).toHaveCount(1);
    const { invites } = await friends.api(b, 'GET', '/friends/invites');
    const invite = invites.find((row) => row.senderId === U(a));
    expect(invite, 'B가 받은 A 초대').toBeTruthy();

    // B가 친구 목록에서 A 차단
    await K.showList(b.page);
    await K.friendRow(b.page, U(a)).getByRole('button', { name: `${nickOf(a)} 차단`, exact: true }).click();
    await expect(K.friendRow(b.page, U(a))).toHaveCount(0);

    await K.openTab(b.page, '게임 초대');
    await expect(K.liveInviteRows(b.page, nickOf(a))).toHaveCount(0);
    await expect(modal.locator(`li[data-friend-id="${U(b)}"]`)).toHaveCount(0);
    await expect(modal.getByRole('button', { name: new RegExp(`^${nickOf(b)} `) })).toHaveCount(0);
    const row = await K.waitInviteStatus(invite.inviteId, 'CANCELLED');
    expect(row.end_reason).toBe('BLOCKED');
});

// ── 2026-11-16 새로 만든 기능 (친구 끊기) ──

test('A13-H-502 A 대기방(정원 6)에서 B 초대 → B가 A를 끊음 → B 받은 초대 줄 사라짐, A 초대 창에서 B 사라짐(새로고침 없이), DB 초대 CANCELLED·UNFRIENDED @hard', async ({ players }) => {
    test.setTimeout(180_000);
    const a = await players.add();
    const b = await players.add();
    await friends.makeFriends(a, b);
    await createRoomUi(a, { maxPlayers: 6 });

    const modal = await K.inviteFromModal(a.page, nickOf(b));
    await expect(modal.getByRole('button', { name: `${nickOf(b)} 초대 보내는 중`, exact: true })).toBeVisible();
    await K.openTab(b.page, '게임 초대');
    await expect(K.liveInviteRows(b.page, nickOf(a))).toHaveCount(1);
    const { invites } = await friends.api(b, 'GET', '/friends/invites');
    const invite = invites.find((row) => row.senderId === U(a));
    expect(invite, 'B가 받은 A 초대').toBeTruthy();

    // B가 로비 친구 목록에서 A "끊기" → 확인
    await K.showList(b.page);
    const row = K.friendRow(b.page, U(a));
    await row.getByRole('button', { name: `${nickOf(a)} 친구 끊기`, exact: true }).click();
    await row.getByRole('button', { name: `${nickOf(a)} 친구 끊기 확인`, exact: true }).click();
    await expect(K.friendRow(b.page, U(a))).toHaveCount(0);

    await K.openTab(b.page, '게임 초대');
    await expect(K.liveInviteRows(b.page, nickOf(a))).toHaveCount(0);
    await expect(modal.getByRole('button', { name: new RegExp(`^${nickOf(b)} `) })).toHaveCount(0);
    const ended = await K.waitInviteStatus(invite.inviteId, 'CANCELLED');
    expect(ended.end_reason).toBe('UNFRIENDED');
});
