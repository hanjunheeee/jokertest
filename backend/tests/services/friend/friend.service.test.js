'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'friend-service-public-profile-test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../../models');
const friendService = require('../../../services/friend');
const friendRepository = require('../../../repositories/friend.repositories');
const economyService = require('../../../services/economy');

const stubFriendRepository = (t, overrides) => {
    const keys = [
        'findFriendship', 'findOnlinePresences',
        'findBlockedCounterpartUuids', 'findFavoriteFriendIds',
        'searchUsersByNickname', 'findExistingFriendship', 'setFriendFavorite',
        'findBlocksOwnedBy', 'deleteBlock',
        'lockAccountsInOrder', 'cancelPendingRequestsBetween',
        'createFriendRequest', 'updateFriendRequestStatus', 'createFriendship',
    ];
    const originals = Object.fromEntries(keys.map((key) => [key, friendRepository[key]]));
    Object.assign(friendRepository, {
        findBlockedCounterpartUuids: async () => [],
        findFavoriteFriendIds: async () => [],
        ...overrides,
    });
    t.after(() => Object.assign(friendRepository, originals));
};

const stubEconomyService = (t, overrides) => {
    const keys = ['getPublicProfileLoadouts'];
    const originals = Object.fromEntries(keys.map((key) => [key, economyService[key]]));
    Object.assign(economyService, overrides);
    t.after(() => Object.assign(economyService, originals));
};

test('F-13 AC-05: getFriendList은 실제 장착 사진·테두리를 친구마다 서로 다른 값으로 응답에 싣는다', async (t) => {
    stubFriendRepository(t, {
        findFriendship: async (myUuid) => [
            {
                requester_id: myUuid,
                receiver_id: 'friend-a',
                Friend1: { uuid: myUuid, nickname: '나', profile_image_url: null },
                Friend2: { uuid: 'friend-a', nickname: '친구에이', profile_image_url: null },
            },
            {
                requester_id: 'friend-b',
                receiver_id: myUuid,
                Friend1: { uuid: 'friend-b', nickname: '친구비', profile_image_url: null },
                Friend2: { uuid: myUuid, nickname: '나', profile_image_url: null },
            },
        ],
        findOnlinePresences: async () => [],
    });
    let seenUserIds = null;
    stubEconomyService(t, {
        getPublicProfileLoadouts: async (userIds) => {
            seenUserIds = userIds;
            return {
                'friend-a': { profilePhotoId: 'player-profile-기사', profileBorderId: 'profile-border-귀족' },
                'friend-b': { profilePhotoId: 'player-profile-드워프', profileBorderId: 'profile-border-평민' },
            };
        },
    });

    const friends = await friendService.getFriendList('me');

    assert.deepEqual([...seenUserIds].sort(), ['friend-a', 'friend-b'], '실제로 조회 대상 uuid가 친구 목록 그대로 전달되어야 한다');
    const a = friends.find((f) => f.id === 'friend-a');
    const b = friends.find((f) => f.id === 'friend-b');
    assert.equal(a.accountProfilePhotoId, 'player-profile-기사');
    assert.equal(a.accountProfileBorderId, 'profile-border-귀족');
    assert.equal(b.accountProfilePhotoId, 'player-profile-드워프');
    assert.equal(b.accountProfileBorderId, 'profile-border-평민');
    assert.notEqual(a.accountProfilePhotoId, b.accountProfilePhotoId, '서로 다른 계정은 서로 다른 값이어야 한다(고정값이 아니다)');
    assert.notEqual(a.accountProfileBorderId, b.accountProfileBorderId, '서로 다른 계정은 서로 다른 값이어야 한다(고정값이 아니다)');

    for (const friend of friends) {
        assert.deepEqual(
            Object.keys(friend).sort(),
            ['accountProfileBorderId', 'accountProfilePhotoId', 'id', 'isFavorite', 'name', 'online', 'profile', 'status'],
            '지갑·소유 목록 등 다른 정보가 섞이면 안 된다',
        );
    }
});

test('F-13 AC-05: 조회 결과에 없는(응답 누락) 친구는 null로 안전하게 대체된다', async (t) => {
    stubFriendRepository(t, {
        findFriendship: async (myUuid) => [
            {
                requester_id: myUuid,
                receiver_id: 'friend-c',
                Friend1: { uuid: myUuid, nickname: '나', profile_image_url: null },
                Friend2: { uuid: 'friend-c', nickname: '친구씨', profile_image_url: null },
            },
        ],
        findOnlinePresences: async () => [],
    });
    stubEconomyService(t, { getPublicProfileLoadouts: async () => ({}) });

    const [friend] = await friendService.getFriendList('me');
    assert.equal(friend.accountProfilePhotoId, null);
    assert.equal(friend.accountProfileBorderId, null);
});

const twoFriendships = (myUuid) => [
    {
        requester_id: myUuid,
        receiver_id: 'friend-a',
        Friend1: { uuid: myUuid, nickname: '나', profile_image_url: null },
        Friend2: { uuid: 'friend-a', nickname: '친구에이', profile_image_url: null },
    },
    {
        requester_id: 'friend-b',
        receiver_id: myUuid,
        Friend1: { uuid: 'friend-b', nickname: '친구비', profile_image_url: null },
        Friend2: { uuid: myUuid, nickname: '나', profile_image_url: null },
    },
];

test('F-19 AC-03: 즐겨찾기는 서버 값에서 복원된다(프론트 로컬 Set이 아니다)', async (t) => {
    stubFriendRepository(t, {
        findFriendship: async (myUuid) => twoFriendships(myUuid),
        findOnlinePresences: async () => [],
        findFavoriteFriendIds: async (ownerId) => (ownerId === 'me' ? ['friend-b'] : []),
    });
    stubEconomyService(t, { getPublicProfileLoadouts: async () => ({}) });

    const friends = await friendService.getFriendList('me');

    assert.equal(friends.find((f) => f.id === 'friend-a').isFavorite, false);
    assert.equal(friends.find((f) => f.id === 'friend-b').isFavorite, true);
});

test('F-19 AC-04/AC-05: 차단 관계인 친구는 목록에서 빠지지만 관계 조회 자체는 남는다', async (t) => {
    let loadoutQuery = null;
    stubFriendRepository(t, {
        findFriendship: async (myUuid) => twoFriendships(myUuid),
        findOnlinePresences: async () => [],
        findBlockedCounterpartUuids: async () => ['friend-b'],
    });
    stubEconomyService(t, {
        getPublicProfileLoadouts: async (uuids) => { loadoutQuery = uuids; return {}; },
    });

    const friends = await friendService.getFriendList('me');

    assert.deepEqual(friends.map((f) => f.id), ['friend-a']);
    assert.deepEqual(loadoutQuery, ['friend-a']);
    assert.equal((await friendRepository.findFriendship('me')).length, 2);
});

test('F-19 AC-01: 검색 결과는 실제 접속 상태를 ONLINE/OFFLINE/UNKNOWN으로 구분한다', async (t) => {
    stubFriendRepository(t, {
        searchUsersByNickname: async () => [
            { uuid: 'u-online', nickname: '접속', profile_image_url: null },
            { uuid: 'u-offline', nickname: '오프', profile_image_url: null },
            { uuid: 'u-unknown', nickname: '미상', profile_image_url: null },
        ],
        findOnlinePresences: async () => [
            { user_id: 'u-online', status: 'ONLINE' },
            { user_id: 'u-offline', status: 'OFFLINE' },
        ],
    });
    stubEconomyService(t, {
        getPublicProfileLoadouts: async () => ({
            'u-online': { profilePhotoId: 'player-profile-기사', profileBorderId: null },
        }),
    });

    const results = await friendService.searchUsers('검', 'me');

    assert.deepEqual(results.map((r) => r.status), ['ONLINE', 'OFFLINE', 'UNKNOWN']);
    assert.notEqual(results[2].status, 'OFFLINE');
    assert.equal(results[0].accountProfilePhotoId, 'player-profile-기사');
    assert.equal(results[1].accountProfilePhotoId, null);
});

test('F-19 AC-03: 친구가 아닌 계정은 즐겨찾기로 저장되지 않는다', async (t) => {
    let wrote = false;
    stubFriendRepository(t, {
        findExistingFriendship: async () => null,
        setFriendFavorite: async () => { wrote = true; return true; },
    });

    await assert.rejects(
        () => friendService.setFriendFavorite('me', 'stranger', true),
        (error) => error.status === 404,
    );
    assert.equal(wrote, false, '검증 실패 시 어떤 행도 쓰지 않아야 한다');
});

test('F-19 AC-03: 같은 값을 두 번 저장해도 결과가 뒤집히지 않는다(toggle이 아니다)', async (t) => {
    const calls = [];
    stubFriendRepository(t, {
        findExistingFriendship: async () => ({ status: 'ACCEPTED' }),
        setFriendFavorite: async (ownerId, friendId, desired) => { calls.push([ownerId, friendId, desired]); return desired; },
    });

    assert.deepEqual(await friendService.setFriendFavorite('me', 'friend-a', true), { friendId: 'friend-a', favorite: true });
    assert.deepEqual(await friendService.setFriendFavorite('me', 'friend-a', true), { friendId: 'friend-a', favorite: true });

    assert.deepEqual(calls, [['me', 'friend-a', true], ['me', 'friend-a', true]]);
});

const stubTransaction = (t) => {
    const original = db.sequelize.transaction;
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    let committed = false;
    db.sequelize.transaction = async (callback) => {
        const value = await callback(transaction);
        committed = true;
        return value;
    };
    t.after(() => { db.sequelize.transaction = original; });
    return { transaction, didCommit: () => committed };
};

test('F-19 AC-04: 차단 해제는 인증 owner의 행만 지우고, 정렬 계정 잠금 안에서 수행된다', async (t) => {
    const steps = [];
    const tx = stubTransaction(t);
    stubFriendRepository(t, {
        lockAccountsInOrder: async (uuids, options) => {
            steps.push(['lock', [...uuids].sort().join('|'), options.transaction === tx.transaction]);
            return uuids.map((uuid) => ({ uuid, status: 'ACTIVE' }));
        },
        deleteBlock: async (ownerId, blockedId, options) => {
            steps.push(['delete', ownerId, blockedId, options?.transaction === tx.transaction]);
            return ownerId === 'owner' ? 1 : 0;
        },
    });

    assert.deepEqual(await friendService.unblockUser('owner', 'target'), { unblockedId: 'target' });
    await assert.rejects(
        () => friendService.unblockUser('someone-else', 'target'),
        (error) => error.status === 404,
    );

    assert.deepEqual(steps, [
        ['lock', 'owner|target', true],
        ['delete', 'owner', 'target', true],
        ['lock', 'someone-else|target', true],
        ['delete', 'someone-else', 'target', true],
    ], '해제는 잠금을 먼저 잡고, 같은 트랜잭션 안에서 owner 한정으로 지워야 한다');
});

test('F-19 AC-05: 해제 트랜잭션은 취소된 요청·초대를 되살리는 어떤 쓰기도 하지 않는다', async (t) => {
    stubTransaction(t);
    const forbidden = [];
    stubFriendRepository(t, {
        lockAccountsInOrder: async (uuids) => uuids.map((uuid) => ({ uuid, status: 'ACTIVE' })),
        deleteBlock: async () => 1,
        cancelPendingRequestsBetween: async () => { forbidden.push('requests'); },
        createFriendRequest: async () => { forbidden.push('create-request'); },
        updateFriendRequestStatus: async () => { forbidden.push('update-request'); },
        createFriendship: async () => { forbidden.push('friendship'); },
    });

    await friendService.unblockUser('owner', 'target');
    assert.deepEqual(forbidden, [], '해제만으로 CANCELLED가 PENDING으로 돌아가면 안 된다');
});
