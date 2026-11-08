'use strict';

// 친구 시험: 신청·수락·거절·결과 다시 묻기·차단·차단 풀기·즐겨찾기·목록·검색(LIKE 이스케이프)·사건 전송·컨트롤러
// 저장소 함수와 트랜잭션은 가짜로 바꿔 끼움 (진짜 DB 안 씀), DB 주소는 닿지 않는 곳으로 막음
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../models');
const { Op } = db.Sequelize;
const friendshipRepository = require('../../repositories/friend/friendship');
const friendRequestRepository = require('../../repositories/friend/request');
const blockRepository = require('../../repositories/friend/block');
const userLookup = require('../../repositories/user/lookup');
const onlinePresenceRepository = require('../../repositories/presence/onlinePresence');
const economyService = require('../../services/economy');
const notificationService = require('../../services/notification');
const gameInviteService = require('../../services/friend/gameInvite');
const emitter = require('../../socket/emitter');
const friendService = require('../../services/friend');
const friendController = require('../../controllers/friend.controller');

// 바꿔 끼우기, 시험 끝나면 거꾸로 되돌림 (같은 함수 두 번 바꿔도 처음 것으로)
const restoreStacks = new WeakMap();
const swap = (t, target, name, impl) => {
    if (!restoreStacks.has(t)) {
        const stack = [];
        restoreStacks.set(t, stack);
        t.after(() => { while (stack.length) stack.pop()(); });
    }
    const original = target[name];
    target[name] = impl;
    restoreStacks.get(t).push(() => { target[name] = original; });
};

// 가짜 트랜잭션 (부른 일만 그대로 돌림)
const fakeTransaction = (t) => {
    const tx = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    swap(t, db.sequelize, 'transaction', async (work) => work(tx));
    return tx;
};

// 계정 잠금 흉내: uuid → 상태 표 (없는 사람은 null)
const fakeAccounts = (t, table) => {
    const locked = [];
    swap(t, friendshipRepository, 'lockAccountsInOrder', async (uuids) => {
        const ordered = [...new Set(uuids)].sort();
        locked.push(ordered);
        return ordered.map((uuid) => (table[uuid] ? { uuid, status: table[uuid] } : null));
    });
    return locked;
};

// 신청 보내기 기본 가짜들
const sendFakes = (t, { accounts = { me: 'ACTIVE', you: 'ACTIVE' }, blocks = [], friendship = null, pending = null } = {}) => {
    fakeTransaction(t);
    const locked = fakeAccounts(t, accounts);
    swap(t, blockRepository, 'findBlocksBetween', async () => blocks);
    swap(t, friendshipRepository, 'findExistingFriendship', async () => friendship);
    swap(t, friendRequestRepository, 'findPendingRequest', async () => pending);
    const created = [];
    swap(t, friendRequestRepository, 'createFriendRequest', async (a, b) => { created.push([a, b]); return { id: 77 }; });
    swap(t, userLookup, 'findNickname', async () => ({ nickname: '보낸이' }));
    const notified = [];
    swap(t, notificationService, 'createForFriendRequest', async (input) => { notified.push(input); return { created: true, notification: { id: 'n1' } }; });
    const emitted = [];
    swap(t, notificationService, 'emitNotificationCreated', (userId, n) => { emitted.push([userId, n.id]); });
    return { created, notified, emitted, locked };
};

const rejects = (promise, status, pattern) => assert.rejects(promise, (err) => {
    assert.equal(err.status ?? err.statusCode, status);
    if (pattern) assert.match(err.message, pattern);
    return true;
});

// ── 신청 보내기 ──
test('신청: 받는 사람 없으면 400', async () => {
    await rejects(friendService.sendFriendRequest('me', ''), 400, /receiverId/);
});

test('신청: 나 자신이면 400', async () => {
    await rejects(friendService.sendFriendRequest('me', 'me'), 400, /자기 자신/);
});

test('신청: 성공하면 신청 행·알림 만들고 커밋 뒤 알림 전송', async (t) => {
    const { created, notified, emitted } = sendFakes(t);
    const request = await friendService.sendFriendRequest('me', 'you');
    assert.equal(request.id, 77);
    assert.deepEqual(created, [['me', 'you']]);
    assert.deepEqual(notified, [{ receiverId: 'you', requestId: 77, requesterNickname: '보낸이' }]);
    assert.deepEqual(emitted, [['you', 'n1']]);
});

test('신청: 없는 계정이면 404', async (t) => {
    sendFakes(t, { accounts: { me: 'ACTIVE' } });
    await rejects(friendService.sendFriendRequest('me', 'you'), 404);
});

test('신청: 정지 계정이면 403', async (t) => {
    sendFakes(t, { accounts: { me: 'ACTIVE', you: 'SUSPENDED' } });
    await rejects(friendService.sendFriendRequest('me', 'you'), 403);
});

test('신청: 차단 관계면 403, 신청 행 안 만듦', async (t) => {
    const { created } = sendFakes(t, { blocks: [{ owner_id: 'you', blocked_id: 'me' }] });
    await rejects(friendService.sendFriendRequest('me', 'you'), 403, /차단/);
    assert.equal(created.length, 0);
});

test('신청: 이미 친구면 409', async (t) => {
    sendFakes(t, { friendship: { status: 'ACCEPTED' } });
    await rejects(friendService.sendFriendRequest('me', 'you'), 409, /이미 친구/);
});

test('신청: 이미 대기 신청 있으면 409', async (t) => {
    sendFakes(t, { pending: { id: 1 } });
    await rejects(friendService.sendFriendRequest('me', 'you'), 409, /신청 중/);
});

test('신청: 동시 신청이 유일 제약에 걸리면 409로 바꿈', async (t) => {
    sendFakes(t);
    swap(t, friendRequestRepository, 'createFriendRequest', async () => {
        const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e;
    });
    await rejects(friendService.sendFriendRequest('me', 'you'), 409);
});

test('신청: 알림이 이미 있던 것(created false)이면 전송 안 함', async (t) => {
    const { emitted } = sendFakes(t);
    swap(t, notificationService, 'createForFriendRequest', async () => ({ created: false, notification: { id: 'old' } }));
    await friendService.sendFriendRequest('me', 'you');
    assert.deepEqual(emitted, []);
});

test('신청: 두 계정 잠금은 uuid 정렬 순서', async (t) => {
    const { locked } = sendFakes(t);
    await friendService.sendFriendRequest('you', 'me');
    assert.deepEqual(locked[0], ['me', 'you']);
});

// ── 수락·거절 ──
const respondFakes = (t, request, { accounts = { req: 'ACTIVE', me: 'ACTIVE' }, blocks = [], friendship = null } = {}) => {
    fakeTransaction(t);
    fakeAccounts(t, accounts);
    swap(t, friendRequestRepository, 'findRequestById', async () => (request ? { ...request } : null));
    swap(t, blockRepository, 'findBlocksBetween', async () => blocks);
    const updates = [];
    swap(t, friendRequestRepository, 'updateFriendRequestStatus', async (id, status) => { updates.push([id, status]); });
    swap(t, friendshipRepository, 'findExistingFriendship', async () => friendship);
    const friendships = [];
    swap(t, friendshipRepository, 'createFriendship', async (a, b) => { friendships.push([a, b]); });
    return { updates, friendships };
};
const pendingRequest = { id: 5, requester_id: 'req', receiver_id: 'me', status: 'PENDING' };

test('수락: 내가 받은 대기 신청이면 ACCEPTED + 친구 관계 만듦', async (t) => {
    const { updates, friendships } = respondFakes(t, pendingRequest);
    const res = await friendService.acceptRequest('me', 5);
    assert.deepEqual(res, { requesterId: 'req' });
    assert.deepEqual(updates, [[5, 'ACCEPTED']]);
    assert.deepEqual(friendships, [['req', 'me']]);
});

test('수락: 친구 관계 이미 있으면 새로 안 만듦', async (t) => {
    const { friendships } = respondFakes(t, pendingRequest, { friendship: { status: 'ACCEPTED' } });
    await friendService.acceptRequest('me', 5);
    assert.deepEqual(friendships, []);
});

test('수락: 신청 없으면 404', async (t) => {
    respondFakes(t, null);
    await rejects(friendService.acceptRequest('me', 5), 404);
});

test('수락: 남이 받은 신청이면 403', async (t) => {
    respondFakes(t, { ...pendingRequest, receiver_id: 'other' }, { accounts: { req: 'ACTIVE', other: 'ACTIVE' } });
    await rejects(friendService.acceptRequest('me', 5), 403);
});

test('수락: 이미 처리된 신청이면 409', async (t) => {
    respondFakes(t, { ...pendingRequest, status: 'DECLINED' });
    await rejects(friendService.acceptRequest('me', 5), 409);
});

test('수락: 그사이 차단됐으면 403, 상태 안 바꿈', async (t) => {
    const { updates } = respondFakes(t, pendingRequest, { blocks: [{}] });
    await rejects(friendService.acceptRequest('me', 5), 403);
    assert.deepEqual(updates, []);
});

test('수락: 보낸 사람이 탈퇴(비활성)면 403', async (t) => {
    respondFakes(t, pendingRequest, { accounts: { req: 'DELETED', me: 'ACTIVE' } });
    await rejects(friendService.acceptRequest('me', 5), 403);
});

test('거절: 내가 받은 대기 신청이면 DECLINED', async (t) => {
    const { updates, friendships } = respondFakes(t, pendingRequest);
    const res = await friendService.declineRequest('me', 5);
    assert.deepEqual(res, { requesterId: 'req' });
    assert.deepEqual(updates, [[5, 'DECLINED']]);
    assert.deepEqual(friendships, []);
});

test('거절: 남이 받은 신청이면 403', async (t) => {
    respondFakes(t, { ...pendingRequest, receiver_id: 'other' });
    await rejects(friendService.declineRequest('me', 5), 403);
});

test('거절: 이미 수락된 신청이면 409', async (t) => {
    respondFakes(t, { ...pendingRequest, status: 'ACCEPTED' });
    await rejects(friendService.declineRequest('me', 5), 409);
});

// ── 결과 다시 묻기·받은 목록 ──
test('결과 다시 묻기: 101개면 400', async () => {
    await rejects(friendService.getRequestResults('me', Array.from({ length: 101 }, (_, i) => i + 1)), 400);
});

test('결과 다시 묻기: 양의 정수만 겹침 없이, 하나도 없으면 DB 안 감', async (t) => {
    let calledWith = null;
    swap(t, friendRequestRepository, 'findRequestResults', async (uuid, ids) => { calledWith = ids; return []; });
    assert.deepEqual(await friendService.getRequestResults('me', ['x', '-1', '0', '1.5']), []);
    assert.equal(calledWith, null);
    await friendService.getRequestResults('me', ['3', 3, '4', 'abc']);
    assert.deepEqual(calledWith, [3, 4]);
});

test('결과 다시 묻기: 행을 request_id·status·responded_at 모양으로', async (t) => {
    swap(t, friendRequestRepository, 'findRequestResults', async () => [{ id: 3, status: 'ACCEPTED', responded_at: undefined }]);
    assert.deepEqual(await friendService.getRequestResults('me', [3]), [{ request_id: 3, status: 'ACCEPTED', responded_at: null }]);
});

test('받은 목록: 프로필 사진 없으면 기본 그림, 장착 없으면 null', async (t) => {
    swap(t, friendRequestRepository, 'findIncomingRequests', async () => [
        { id: 9, message: null, created_at: 'c', Requester: { uuid: 'r', nickname: '누구', profile_image_url: null } },
    ]);
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    const [row] = await friendService.getIncomingRequests('me');
    assert.equal(row.request_id, 9);
    assert.equal(row.profile, '/assets/default_profile.png');
    assert.equal(row.accountProfilePhotoId, null);
});

// ── 차단 ──
const blockFakes = (t, accounts = { me: 'ACTIVE', you: 'ACTIVE' }) => {
    fakeTransaction(t);
    fakeAccounts(t, accounts);
    const calls = [];
    swap(t, blockRepository, 'createBlock', async (a, b) => { calls.push(['block', a, b]); });
    swap(t, friendRequestRepository, 'cancelPendingRequestsBetween', async (a, b) => { calls.push(['cancelRequests', a, b]); });
    swap(t, gameInviteService, 'cancelPendingInvitesBetween', async (a, b, reason) => { calls.push(['cancelInvites', a, b, reason]); return ['inv-1']; });
    swap(t, blockRepository, 'deleteBlock', async () => 1);
    return calls;
};

test('차단: 차단 → 대기 신청 취소 → 대기 초대 취소(BLOCKED) 순서', async (t) => {
    const calls = blockFakes(t);
    const res = await friendService.blockUser('me', 'you');
    assert.deepEqual(res, { blockedId: 'you', cancelledInvites: ['inv-1'] });
    assert.deepEqual(calls, [['block', 'me', 'you'], ['cancelRequests', 'me', 'you'], ['cancelInvites', 'me', 'you', 'BLOCKED']]);
});

test('차단: 나 자신이면 400', async () => {
    await rejects(friendService.blockUser('me', 'me'), 400);
});

test('차단: 대상 없으면 400', async () => {
    await rejects(friendService.blockUser('me', undefined), 400);
});

test('차단: 없는 계정이면 404, 아무것도 안 바꿈', async (t) => {
    const calls = blockFakes(t, { me: 'ACTIVE' });
    await rejects(friendService.blockUser('me', 'ghost'), 404);
    assert.deepEqual(calls, []);
});

test('차단 풀기: 내가 단 차단 지우면 unblockedId', async (t) => {
    blockFakes(t);
    assert.deepEqual(await friendService.unblockUser('me', 'you'), { unblockedId: 'you' });
});

test('차단 풀기: 지울 게 없으면 404', async (t) => {
    blockFakes(t);
    swap(t, blockRepository, 'deleteBlock', async () => 0);
    await rejects(friendService.unblockUser('me', 'you'), 404);
});

test('차단 목록: 상대 행 없으면 "알 수 없는 사용자"', async (t) => {
    swap(t, blockRepository, 'findBlocksOwnedBy', async () => [{ blocked_id: 'x', created_at: 'c', BlockedUser: null }]);
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    const [row] = await friendService.getBlockedUsers('me');
    assert.equal(row.name, '알 수 없는 사용자');
    assert.equal(row.id, 'x');
});

// ── 즐겨찾기 ──
test('즐겨찾기: 수락된 친구면 켜짐', async (t) => {
    swap(t, friendshipRepository, 'findExistingFriendship', async () => ({ status: 'ACCEPTED' }));
    swap(t, blockRepository, 'findBlocksBetween', async () => []);
    swap(t, blockRepository, 'setFriendFavorite', async (a, b, desired) => desired);
    assert.deepEqual(await friendService.setFriendFavorite('me', 'f', true), { friendId: 'f', favorite: true });
});

test('즐겨찾기: favorite 값이 참거짓 아니면 400', async () => {
    await rejects(friendService.setFriendFavorite('me', 'f', 'true'), 400);
});

test('즐겨찾기: 나 자신이면 400', async () => {
    await rejects(friendService.setFriendFavorite('me', 'me', true), 400);
});

test('즐겨찾기: 친구 아니면 404', async (t) => {
    swap(t, friendshipRepository, 'findExistingFriendship', async () => ({ status: 'PENDING' }));
    await rejects(friendService.setFriendFavorite('me', 'f', true), 404);
});

test('즐겨찾기: 차단 관계면 403', async (t) => {
    swap(t, friendshipRepository, 'findExistingFriendship', async () => ({ status: 'ACCEPTED' }));
    swap(t, blockRepository, 'findBlocksBetween', async () => [{}]);
    await rejects(friendService.setFriendFavorite('me', 'f', true), 403);
});

// ── 친구 목록·검색 ──
const listFakes = (t, { friendships, blocked = [], presences = [], favorites = [] }) => {
    swap(t, friendshipRepository, 'findFriendship', async () => friendships);
    swap(t, blockRepository, 'findBlockedCounterpartUuids', async () => blocked);
    swap(t, onlinePresenceRepository, 'findOnlinePresences', async () => presences);
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    swap(t, blockRepository, 'findFavoriteFriendIds', async () => favorites);
};
const fs1 = (requester, friend1, friend2) => ({ requester_id: requester, Friend1: friend1, Friend2: friend2 });
const u = (uuid) => ({ uuid, nickname: `닉-${uuid}`, profile_image_url: null });

test('친구 목록: 상대 쪽 계정 고르고 차단 관계 친구는 숨김', async (t) => {
    listFakes(t, {
        friendships: [fs1('me', u('me'), u('a')), fs1('b', u('b'), u('me')), fs1('me', u('me'), u('blocked'))],
        blocked: ['blocked'],
    });
    const list = await friendService.getFriendList('me');
    assert.deepEqual(list.map((f) => f.id), ['a', 'b']);
});

test('친구 목록: 접속 행 없으면 OFFLINE·online false, 즐겨찾기 표시', async (t) => {
    listFakes(t, { friendships: [fs1('me', u('me'), u('a'))], favorites: ['a'] });
    const [row] = await friendService.getFriendList('me');
    assert.equal(row.status, 'OFFLINE');
    assert.equal(row.online, false);
    assert.equal(row.isFavorite, true);
});

test('친구 목록: 소켓 서버 켜져 있는데 접속 목록에 없으면 ONLINE 행이어도 OFFLINE (BE-015)', async (t) => {
    listFakes(t, { friendships: [fs1('me', u('me'), u('a'))], presences: [{ user_id: 'a', status: 'ONLINE' }] });
    emitter.setIo({ to: () => ({ emit() {} }) });
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    const [row] = await friendService.getFriendList('me');
    assert.equal(row.status, 'OFFLINE');
    emitter.onlineUsers.set('a', 'sock-a');
    const [again] = await friendService.getFriendList('me');
    assert.equal(again.status, 'ONLINE');
    assert.equal(again.online, true);
});

test('검색: 빈 검색어·공백만이면 DB 안 감', async (t) => {
    let called = 0;
    swap(t, friendRequestRepository, 'searchUsersByNickname', async () => { called += 1; return []; });
    assert.deepEqual(await friendService.searchUsers('   ', 'me'), []);
    assert.deepEqual(await friendService.searchUsers(undefined, 'me'), []);
    assert.equal(called, 0);
});

test('검색: 검색어 앞뒤 공백 다듬어 넘기고 접속 행 없으면 UNKNOWN', async (t) => {
    let query = null;
    swap(t, friendRequestRepository, 'searchUsersByNickname', async (q) => { query = q; return [u('a')]; });
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    swap(t, onlinePresenceRepository, 'findOnlinePresences', async () => []);
    const [row] = await friendService.searchUsers('  조커 ', 'me');
    assert.equal(query, '조커');
    assert.equal(row.status, 'UNKNOWN');
});

// ── 저장소 (모델 함수만 가짜) ──
test('검색 저장소: LIKE 와일드카드 % _ \\ 앞에 \\ 붙여 글자 그대로 찾음', async (t) => {
    swap(t, db.Friendship, 'findAll', async () => []);
    swap(t, db.FriendRequest, 'findAll', async () => []);
    swap(t, blockRepository, 'findBlockedCounterpartUuids', async () => []);
    let where = null;
    swap(t, db.User, 'findAll', async (options) => { where = options.where; return []; });
    await friendRequestRepository.searchUsersByNickname('50%_a\\b', 'me');
    assert.equal(where.nickname[Op.like], '%50\\%\\_a\\\\b%');
});

test('검색 저장소: 나·친구·보낸 대기 신청·차단 상대 빼고 활성 계정 10명', async (t) => {
    swap(t, db.Friendship, 'findAll', async () => [{ requester_id: 'me', receiver_id: 'f1' }, { requester_id: 'f2', receiver_id: 'me' }]);
    swap(t, db.FriendRequest, 'findAll', async () => [{ receiver_id: 'p1' }]);
    swap(t, blockRepository, 'findBlockedCounterpartUuids', async () => ['b1']);
    let options = null;
    swap(t, db.User, 'findAll', async (o) => { options = o; return []; });
    await friendRequestRepository.searchUsersByNickname('a', 'me');
    assert.deepEqual(options.where.uuid[Op.notIn], ['me', 'f1', 'f2', 'p1', 'b1']);
    assert.equal(options.where.status, 'ACTIVE');
    assert.equal(options.limit, 10);
});

test('차단 저장소: 차단 상대 uuid는 내가 했든 당했든 겹침 없이', async (t) => {
    swap(t, db.FriendBlock, 'findAll', async () => [
        { owner_id: 'me', blocked_id: 'a' }, { owner_id: 'a', blocked_id: 'me' }, { owner_id: 'b', blocked_id: 'me' },
    ]);
    assert.deepEqual(await blockRepository.findBlockedCounterpartUuids('me'), ['a', 'b']);
});

test('즐겨찾기 저장소: 끄면 destroy, 결과 false', async (t) => {
    let destroyed = null;
    swap(t, db.FriendFavorite, 'destroy', async (o) => { destroyed = o.where; return 1; });
    assert.equal(await blockRepository.setFriendFavorite('me', 'f', false), false);
    assert.deepEqual(destroyed, { owner_id: 'me', friend_id: 'f' });
});

test('계정 잠금 저장소: 빈 값·겹친 uuid 빼고 정렬 순서로 FOR UPDATE', async (t) => {
    const order = [];
    swap(t, db.User, 'findOne', async (o) => { order.push([o.where.uuid, o.lock]); return { uuid: o.where.uuid, status: 'ACTIVE' }; });
    const rows = await friendshipRepository.lockAccountsInOrder(['b', 'a', 'b', '', null], { transaction: { LOCK: { UPDATE: 'U' } } });
    assert.deepEqual(order, [['a', 'U'], ['b', 'U']]);
    assert.equal(rows.length, 2);
});

test('신청 저장소: 결과 다시 묻기는 내가 낀 신청만 (보낸 사람·받는 사람 조건)', async (t) => {
    let where = null;
    swap(t, db.FriendRequest, 'findAll', async (o) => { where = o.where; return []; });
    await friendRequestRepository.findRequestResults('me', [1, 2]);
    assert.deepEqual(where.id[Op.in], [1, 2]);
    assert.deepEqual(where[Op.or], [{ requester_id: 'me' }, { receiver_id: 'me' }]);
});

// ── 사건 전송 ──
test('사건 전송: 수락 사건에 효과음 id friend-request:N:accepted', (t) => {
    const sent = [];
    emitter.setIo({ to: (id) => ({ emit: (event, payload) => sent.push({ id, event, payload }) }) });
    emitter.onlineUsers.set('req', 'sock-req');
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    friendService.notifyRequestAccepted('req', 'me', 5);
    assert.equal(sent[0].event, 'friend_request_accepted');
    assert.equal(sent[0].payload.byUuid, 'me');
    assert.equal(sent[0].payload.sfxEvent.eventId, 'friend-request:5:accepted');
});

test('사건 전송: 요청 id 숫자 아니면 효과음 없이 사건만', (t) => {
    const sent = [];
    emitter.setIo({ to: () => ({ emit: (event, payload) => sent.push({ event, payload }) }) });
    emitter.onlineUsers.set('you', 's');
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    friendService.notifyRequestReceived('you', undefined);
    assert.deepEqual(sent, [{ event: 'friend_request_received', payload: {} }]);
});

test('사건 전송: 보내다 터져도 안 던짐', (t) => {
    emitter.setIo({ to: () => ({ emit() { throw new Error('boom'); } }) });
    emitter.onlineUsers.set('you', 's');
    t.mock.method(console, 'error', () => {});
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); });
    assert.doesNotThrow(() => friendService.notifyBlocked('you'));
});

// ── 컨트롤러 ──
const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body, headers: this.headers }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'me' }, params: {}, query: {}, ...req }, res, (error) => resolve({ error }))).catch((thrown) => resolve({ thrown }));
});

test('컨트롤러 신청: 본문 없으면 400 next', async () => {
    const { error } = await call(friendController.sendFriendRequest, { body: undefined });
    assert.equal(error.status ?? error.statusCode, 400);
});

test('컨트롤러 신청: 성공하면 받는 사람 사건 보내고 200', async (t) => {
    const received = [];
    swap(t, friendService, 'sendFriendRequest', async () => ({ id: 3 }));
    swap(t, friendService, 'notifyRequestReceived', (rid, reqId) => received.push([rid, reqId]));
    const out = await call(friendController.sendFriendRequest, { body: { receiverId: 'you' } });
    assert.equal(out.status, 200);
    assert.deepEqual(received, [['you', 3]]);
});

test('컨트롤러 수락: 숫자 아닌 id면 서비스 안 부르고 400', async (t) => {
    let called = 0;
    swap(t, friendService, 'acceptRequest', async () => { called += 1; });
    const { error } = await call(friendController.acceptRequest, { params: { id: 'abc' } });
    assert.equal(error.status ?? error.statusCode, 400);
    assert.equal(called, 0);
});

test('컨트롤러 수락: 성공하면 data.status ACCEPTED, 보낸 사람에게 사건', async (t) => {
    const sent = [];
    swap(t, friendService, 'acceptRequest', async () => ({ requesterId: 'req' }));
    swap(t, friendService, 'notifyRequestAccepted', (...args) => sent.push(args));
    const out = await call(friendController.acceptRequest, { params: { id: '12' } });
    assert.deepEqual(out.body.data, { request_id: 12, status: 'ACCEPTED' });
    assert.deepEqual(sent, [['req', 'me', 12]]);
});

test('컨트롤러 차단: 나·상대 둘 다 관계 무효 사건', async (t) => {
    const sent = [];
    swap(t, friendService, 'blockUser', async () => ({ blockedId: 'you', cancelledInvites: [] }));
    swap(t, friendService, 'notifyBlocked', (id) => sent.push(id));
    await call(friendController.blockUser, { body: { targetId: 'you' } });
    assert.deepEqual(sent, ['me', 'you']);
});

test('컨트롤러 차단 풀기: 푼 사람에게만 사건', async (t) => {
    const sent = [];
    swap(t, friendService, 'unblockUser', async () => ({ unblockedId: 'you' }));
    swap(t, friendService, 'notifyUnblocked', (id) => sent.push(id));
    await call(friendController.unblockUser, { params: { targetId: 'you' } });
    assert.deepEqual(sent, ['me']);
});

test('컨트롤러 검색: 캐시 금지 헤더', async (t) => {
    swap(t, friendService, 'searchUsers', async () => []);
    const out = await call(friendController.searchUsers, { query: { q: 'a' } });
    assert.equal(out.headers['Cache-Control'], 'no-store');
});

test('컨트롤러 결과 다시 묻기: 쉼표로 나누고 빈 칸 뺌', async (t) => {
    let ids = null;
    swap(t, friendService, 'getRequestResults', async (me, list) => { ids = list; return []; });
    await call(friendController.getRequestResults, { query: { ids: '1, 2,,3 ' } });
    assert.deepEqual(ids, ['1', '2', '3']);
});

test('컨트롤러 결과 다시 묻기: ids가 배열(?ids=1&ids=2)이면 빈 목록으로', async (t) => {
    let ids = null;
    swap(t, friendService, 'getRequestResults', async (me, list) => { ids = list; return []; });
    await call(friendController.getRequestResults, { query: { ids: ['1', '2'] } });
    assert.deepEqual(ids, []);
});

test('컨트롤러 서비스 오류는 next로 넘김', async (t) => {
    const boom = new Error('x');
    swap(t, friendService, 'getFriendList', async () => { throw boom; });
    const { error } = await call(friendController.getFriends, {});
    assert.equal(error, boom);
});
