// 응답 잃은 뒤 다시 묻기 시험: 설정 저장·추방·초대 수락 응답을 못 받았다 치고 결과 묻기 사건으로 물으면 같은 결과가 옴
// 빈칸찾기 하 5·6·7 — 진짜 시험 서버에 소켓 봇으로 (화면이 응답 시간 넘겼을 때 보내는 것과 같은 사건·모양)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const L = require('../lobby/lobbyHelpers');

// 봇 방장 방 + 손님 봇 하나 → { host, guest, room(손님 입장 뒤 최신 방) }
async function roomWithGuest(bots) {
    const [host, guest] = await bots.spawn(2);
    const created = await host.createRoom();
    await guest.joinByCode(created.roomCode);
    const current = await host.request('get_current_room', {});
    expect(current?.room?.players?.length).toBe(2);
    return { host, guest, room: current.room };
}

const seatOf = (room, uuid) => room.players.find((p) => p.uuid === uuid)?.membershipId;

// 방장 봇 설정 저장 (정원 6 고정, 화면이 보내는 칸 모양 그대로) → ack
const SETTINGS = { accessType: 'code', maxPlayers: 6, jokerCount: 1, roleCompositionMode: 'auto', dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 };
const saveSettings = (host, roomId, expectedSettingsVersion, requestId) => host.request('update_room_settings', {
    roomId, requestId, expectedSettingsVersion, ...SETTINGS,
});

test.describe('설정 저장 결과 다시 묻기 (get_room_settings_update_result)', () => {
    test('저장한 요청 id로 다시 물으면 → APPLIED + 저장 때 받은 설정 버전·지금 방', async ({ bots }) => {
        const { host, room } = await roomWithGuest(bots);
        const requestId = crypto.randomUUID();
        const saved = await saveSettings(host, room.roomId, room.settingsVersion, requestId);
        expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, changed: true, requestId });
        const again = await host.request('get_room_settings_update_result', { roomId: room.roomId, requestId });
        expect(again).toMatchObject({ ok: true, status: 'APPLIED', changed: true, settingsVersion: saved.settingsVersion, requestId });
        expect(again.room.roomId).toBe(room.roomId);
        expect(again.room.settings.maxPlayers).toBe(6);
    });

    test('바뀐 게 없던 저장을 다시 물으면 → NO_CHANGE, 서버에 없는 요청 id면 → UNKNOWN', async ({ bots }) => {
        const { host, room } = await roomWithGuest(bots);
        const first = await saveSettings(host, room.roomId, room.settingsVersion, crypto.randomUUID());
        expect(first, JSON.stringify(first)).toMatchObject({ ok: true, changed: true });
        const requestId = crypto.randomUUID();
        const same = await saveSettings(host, room.roomId, first.settingsVersion, requestId);
        expect(same, JSON.stringify(same)).toMatchObject({ ok: true, changed: false });
        expect(await host.request('get_room_settings_update_result', { roomId: room.roomId, requestId }))
            .toMatchObject({ ok: true, status: 'NO_CHANGE', changed: false });
        expect(await host.request('get_room_settings_update_result', { roomId: room.roomId, requestId: crypto.randomUUID() }))
            .toMatchObject({ ok: true, status: 'UNKNOWN' });
    });
});

test.describe('추방 결과 다시 묻기 (get_kick_result)', () => {
    test('추방한 요청 id로 다시 물으면 → 같은 KICKED 결과(replayed)이고 손님은 방에 없음', async ({ bots }) => {
        const { host, guest, room } = await roomWithGuest(bots);
        const requestId = crypto.randomUUID();
        const kicked = await host.request('kick_room_player', {
            requestId, bootEpoch: room.bootEpoch, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
            requesterMembershipId: seatOf(room, host.uuid), targetUuid: guest.uuid, targetMembershipId: seatOf(room, guest.uuid),
        });
        expect(kicked, JSON.stringify(kicked)).toMatchObject({ ok: true, status: 'KICKED', targetUuid: guest.uuid });
        const again = await host.request('get_kick_result', { bootEpoch: room.bootEpoch, requestId });
        expect(again).toMatchObject({ ok: true, status: 'KICKED', replayed: true, requestId, targetUuid: guest.uuid });
        const after = await host.request('get_current_room', {});
        expect(after.room.players.map((p) => p.uuid)).toEqual([host.uuid]);
    });

    test('모르는 요청 id·남의 영수증으로 물으면 → UNKNOWN (남의 결과는 안 보임)', async ({ bots }) => {
        const { host, guest, room } = await roomWithGuest(bots);
        const requestId = crypto.randomUUID();
        await host.request('kick_room_player', {
            requestId, bootEpoch: room.bootEpoch, roomId: room.roomId, roomInstanceId: room.roomInstanceId,
            requesterMembershipId: seatOf(room, host.uuid), targetUuid: guest.uuid, targetMembershipId: seatOf(room, guest.uuid),
        });
        expect(await host.request('get_kick_result', { bootEpoch: room.bootEpoch, requestId: crypto.randomUUID() }))
            .toMatchObject({ ok: true, status: 'UNKNOWN' });
        expect(await guest.request('get_kick_result', { bootEpoch: room.bootEpoch, requestId }))
            .toMatchObject({ ok: true, status: 'UNKNOWN' });
    });
});

test.describe('초대 수락 결과 다시 묻기 (get_game_invite_result)', () => {
    // 방장 봇이 친구 봇을 초대 → { host, friend, invite }
    async function invitedFriend(bots) {
        const [host, friend] = await bots.spawn(2);
        await L.botApi(host, 'POST', '/friends/requests', { receiverId: friend.uuid });
        const incoming = await L.botApi(friend, 'GET', '/friends/requests/incoming');
        await L.botApi(friend, 'PUT', `/friends/requests/${incoming.find((r) => r.id === host.uuid).request_id}/accept`);
        const room = await host.createRoom();
        const invite = await L.botApi(host, 'POST', '/friends/invites', { receiverId: friend.uuid, creationKey: crypto.randomUUID() });
        return { host, friend, room, invite };
    }

    test('수락한 뒤 다시 물으면 → entered:true 와 들어간 그 방', async ({ bots }) => {
        const { friend, room, invite } = await invitedFriend(bots);
        const accepted = await friend.request('accept_game_invite', { inviteId: invite.inviteId });
        expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
        const again = await friend.request('get_game_invite_result', { inviteId: invite.inviteId, attemptId: accepted.attemptId });
        expect(again, JSON.stringify(again)).toMatchObject({ ok: true, entered: true });
        expect(again.room.roomId).toBe(room.roomId);
        expect(again.room.players.map((p) => p.uuid)).toContain(friend.uuid);
    });

    test('수락 안 한 초대를 물으면 → entered:false, 남의 초대면 → INVITE_NOT_FOUND', async ({ bots }) => {
        const { host, friend, invite } = await invitedFriend(bots);
        expect(await friend.request('get_game_invite_result', { inviteId: invite.inviteId }))
            .toMatchObject({ ok: true, entered: false });
        expect(await host.request('get_game_invite_result', { inviteId: invite.inviteId }))
            .toMatchObject({ ok: false, code: 'INVITE_NOT_FOUND' });
    });
});
