'use strict';

// 서버 2대 알림 전달 브라우저 시험 — 한 서버가 받은 공지·게임 초대·친구 접속 표시가 다른 서버에 붙은 사람 화면에 뜸
// 목록 A17-서버-여러대.md 번호 A17-E-016~018 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-signals.spec.js
const crypto = require('node:crypto');
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const { botApi } = require('../../helpers/friends');
const L = require('../lobby/lobbyHelpers');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

test('A17-E-016 서버 ㄱ이 받은 사람 공지 → 서버 ㄴ 로비 사람 알림 창에 바로 뜸 @smoke', async ({ crowd }) => {
    const me = await crowd.on(N2);
    const title = `서버2대 공지 ${crypto.randomBytes(3).toString('hex')}`;
    // 공지 요청은 일부러 서버 ㄱ에 바로 (받는 사람은 서버 ㄴ)
    const sent = await K.internalOn(N1, 'POST', '/internal/announcements', {
        announcementId: `a17-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        title, body: '서버 2대 공지 본문', target: 'users', userUuids: [U(me)],
    });
    expect(sent.ok, `공지 보내기 (${sent.status})`).toBe(true);

    // 새로고침 없이: 안 읽은 알림 표시가 생기고, 알림 창에 그 제목이 읽힘
    await expect(me.page.getByRole('button', { name: /^알림 \(읽지 않음 [1-9]/ })).toBeVisible({ timeout: 15_000 });
    const dialog = await L.openNotifications(me.page);
    await expectReadable(dialog.getByText(title), { timeout: 15_000 });
});

test('A17-E-017 서버 ㄱ 방 봇이 서버 ㄴ 사람을 게임 초대 → 초대 알림 → 수락 → 서버 ㄱ 대기방 화면', async ({ crowd, bots }) => {
    const [host] = await mn.botsOn(bots, 1, N1);
    const me = await crowd.on(N2);
    await K.befriendBot(host, me);
    const room = await host.createRoom();
    expect(await K.roomNodeOf(U(host)), '초대한 방이 있는 서버').toBe(N1);
    await botApi(host, 'POST', '/friends/invites', { receiverId: U(me), creationKey: crypto.randomUUID() });

    // 새로고침 없이 초대가 닿음: 친구 창 "게임 초대" 탭에 숫자 1
    const panel = await L.openFriendPanel(me.page);
    await expectReadable(panel.getByRole('tab', { name: '게임 초대 1' }), { timeout: 15_000 });
    await K.acceptInviteUi(me.page, host.nickname, { open: false });

    await expect(me.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await K8.expectParty(me.page, 2);
    const live = await e2e.roomOf(U(me));
    expect(live?.roomCode, '들어간 방 코드').toBe(room.roomCode);
    expect(live.hostUuid, '방장 = 초대한 봇').toBe(U(host));
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});

test('A17-E-018 친구 봇이 서버 ㄱ에 접속 → 서버 ㄴ 사람 친구 목록에 "접속 중"', async ({ crowd, bots }) => {
    const me = await crowd.on(N2);
    const [friend] = await mn.botsOn(bots, 1, N1);
    await K.befriendBot(friend, me);

    // 친구를 맺은 뒤 로비를 다시 열어 목록을 새로 받음 (친구 맺기는 API로 해서 화면이 모름)
    await K.lobbyOn(me, N2);
    const panel = await L.openFriendPanel(me.page);
    const row = panel.locator(`[data-friend-id="${U(friend)}"]`);
    await expect(row).toContainText(friend.nickname, { timeout: 15_000 });
    await expectReadable(row.getByText('접속 중', { exact: true }), { timeout: 15_000 });
    await expect(row.getByText('오프라인', { exact: true })).toHaveCount(0);
});
