'use strict';

// 친구 버그 수정 시험 파일, 2026-11-09 전수조사 항목 (DB 없이 저장소 함수 갈아끼움)
// 트랜잭션 안 조회 · 수락 계정 확인 · 검색 와일드카드 · 재신청 대기 · 즐겨찾기 차단 · 결과 id 개수 · 본문 없는 요청
process.env.JWT_SECRET = process.env.JWT_SECRET || 'friend-bugfix-test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../../models');
const friendService = require('../../../services/friend');
const friendshipRepository = require('../../../repositories/friend/friendship');
const friendRequestRepository = require('../../../repositories/friend/request');
const blockRepository = require('../../../repositories/friend/block');
const userLookup = require('../../../repositories/user/lookup');
const notificationService = require('../../../services/notification');
const friendController = require('../../../controllers/friend.controller');

// 가짜 트랜잭션: 콜백 바로 부름
const stubTransaction = (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
    return transaction;
};

// 보내기 기본 가짜 묶음 (부른 옵션 기록)
const stubSendPath = (t, overrides = {}) => {
    const seen = {};
    const transaction = stubTransaction(t);
    t.mock.method(friendshipRepository, 'lockAccountsInOrder', async (uuids) => uuids.map((uuid) => ({ uuid, status: 'ACTIVE' })));
    t.mock.method(blockRepository, 'findBlocksBetween', async () => []);
    t.mock.method(friendshipRepository, 'findExistingFriendship', async (a, b, options) => { seen.friendship = options; return null; });
    t.mock.method(friendRequestRepository, 'findPendingRequest', async (a, b, options) => { seen.pending = options; return null; });
    t.mock.method(friendRequestRepository, 'createFriendRequest', async () => ({ id: 7 }));
    t.mock.method(userLookup, 'findNickname', async () => ({ nickname: '나' }));
    t.mock.method(notificationService, 'createForFriendRequest', async () => ({ created: false, notification: null }));
    return { seen, transaction };
};

test('친구 신청 보내기: 이미 친구·대기 신청 조회도 같은 트랜잭션으로 함', async (t) => {
    const { seen, transaction } = stubSendPath(t);
    await friendService.sendFriendRequest('me', 'you');
    assert.equal(seen.friendship?.transaction, transaction);
    assert.equal(seen.pending?.transaction, transaction);
});

// 수락 기본 가짜 묶음
const stubAcceptPath = (t, accounts) => {
    const seen = { writes: [] };
    const transaction = stubTransaction(t);
    const request = { id: 5, requester_id: 'you', receiver_id: 'me', status: 'PENDING' };
    t.mock.method(friendRequestRepository, 'findRequestById', async (id, options) => { seen.findById = options; return request; });
    t.mock.method(friendshipRepository, 'lockAccountsInOrder', async () => accounts);
    t.mock.method(blockRepository, 'findBlocksBetween', async () => []);
    t.mock.method(friendRequestRepository, 'updateFriendRequestStatus', async () => { seen.writes.push('status'); });
    t.mock.method(friendshipRepository, 'findExistingFriendship', async (a, b, options) => { seen.friendship = options; return null; });
    t.mock.method(friendshipRepository, 'createFriendship', async () => { seen.writes.push('friendship'); });
    return { seen, transaction };
};

test('친구 수락: 상대 계정이 활성 아니면 403, 아무것도 안 씀', async (t) => {
    const { seen } = stubAcceptPath(t, [{ uuid: 'me', status: 'ACTIVE' }, { uuid: 'you', status: 'BANNED' }]);
    await assert.rejects(() => friendService.acceptRequest('me', 5), (error) => error.status === 403);
    assert.deepEqual(seen.writes, []);
});

test('친구 수락: 계정 행이 없으면 404', async (t) => {
    stubAcceptPath(t, [{ uuid: 'me', status: 'ACTIVE' }, null]);
    await assert.rejects(() => friendService.acceptRequest('me', 5), (error) => error.status === 404);
});

test('친구 수락: 이미 친구 조회도 같은 트랜잭션으로 함', async (t) => {
    const { seen, transaction } = stubAcceptPath(t, [{ uuid: 'me', status: 'ACTIVE' }, { uuid: 'you', status: 'ACTIVE' }]);
    await friendService.acceptRequest('me', 5);
    assert.equal(seen.friendship?.transaction, transaction);
    assert.deepEqual(seen.writes, ['status', 'friendship']);
});

test('닉네임 검색: % _ \\ 는 글자 그대로 찾게 이스케이프함', async (t) => {
    t.mock.method(db.Friendship, 'findAll', async () => []);
    t.mock.method(db.FriendRequest, 'findAll', async () => []);
    t.mock.method(blockRepository, 'findBlockedCounterpartUuids', async () => []);
    let where = null;
    t.mock.method(db.User, 'findAll', async (options) => { where = options.where; return []; });

    await friendRequestRepository.searchUsersByNickname('a%b_c\\d', 'me');
    const { Op } = db.Sequelize;
    assert.equal(where.nickname[Op.like], '%a\\%b\\_c\\\\d%');
});

test('BE-068: 차단 관계인 친구는 즐겨찾기 못 켜고 끔 (403)', async (t) => {
    let wrote = false;
    t.mock.method(friendshipRepository, 'findExistingFriendship', async () => ({ status: 'ACCEPTED' }));
    t.mock.method(blockRepository, 'findBlocksBetween', async () => [{ owner_id: 'friend-a', blocked_id: 'me' }]);
    t.mock.method(blockRepository, 'setFriendFavorite', async () => { wrote = true; return true; });
    await assert.rejects(() => friendService.setFriendFavorite('me', 'friend-a', true), (error) => error.status === 403);
    await assert.rejects(() => friendService.setFriendFavorite('me', 'friend-a', false), (error) => error.status === 403);
    assert.equal(wrote, false);
});

test('BE-069: 신청 결과 다시 묻기 id가 100개 넘으면 400, DB 안 감', async (t) => {
    let called = false;
    t.mock.method(friendRequestRepository, 'findRequestResults', async () => { called = true; return []; });
    const ids = Array.from({ length: 101 }, (_, i) => String(i + 1));
    await assert.rejects(() => friendService.getRequestResults('me', ids), (error) => error.status === 400);
    assert.equal(called, false);
});

test('BE-069: 100개까지는 그대로 조회', async (t) => {
    let seenIds = null;
    t.mock.method(friendRequestRepository, 'findRequestResults', async (uuid, ids) => { seenIds = ids; return []; });
    const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
    assert.deepEqual(await friendService.getRequestResults('me', ids), []);
    assert.equal(seenIds.length, 100);
});

test('친구 신청 컨트롤러: 본문 없으면 500 아닌 400', async () => {
    let passed = null;
    await friendController.sendFriendRequest(
        { body: undefined, user: { uuid: 'me' } },
        { status() { return this; }, json() { return this; } },
        (error) => { passed = error; },
    );
    assert.equal(passed?.status, 400);
});
