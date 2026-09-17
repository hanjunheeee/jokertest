'use strict';

// backend/models(→Sequelize)는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지
// 않는다 — roleStatistics.integration.test.js와 같은 관례).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'friend-service-public-profile-test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../models');
const friendService = require('./friend.service');
const friendRepository = require('../repositories/friend.repositories');
const economyService = require('./economy.service');

// F-13 AC-05(CODEX-5 재검토) — friend.service.getFriendList은 이미
// economyService.getPublicProfileLoadouts로 친구들의 실제 장착 사진·테두리를 응답에 싣는다
// (backend/service/friend.service.js:18-37). 지금까지 이 경로를 실제로 검증하는 테스트가
// 전혀 없었다 — matchmaking.test.js/roleStatistics.integration.test.js가 주입하는 fake
// economy service는 항상 profilePhotoId/profileBorderId를 null로만 돌려줘, 실제 값이
// 채워져 친구별로 서로 다르게 응답에 실리는지는 아무도 증명하지 못했다. 이 파일은
// friendRepository/economyService를 이 파일 전용으로 몽키패치해(roleStatistics.integration.
// test.js와 같은 관례 — friend.service.js에는 별도 의존성 주입 헬퍼가 없어 exports 객체를
// 직접 교체한다) 실제 non-null 값이 계정마다 정확히 응답에 실리는지, 그리고 지갑·소유
// 목록 등 비공개 정보는 절대 섞이지 않는지 확인한다.

// F-19: getFriendList이 차단 제외(findBlockedCounterpartUuids)와 서버 즐겨찾기
// (findFavoriteFriendIds)도 함께 읽으므로 두 경계를 stub 목록에 추가한다. 두 함수의 기본
// 대역은 "차단 없음 · 즐겨찾기 없음"이라 기존 시험의 기대값은 그대로다.
const stubFriendRepository = (t, overrides) => {
    const keys = [
        'findFriendship', 'findOnlinePresences',
        'findBlockedCounterpartUuids', 'findFavoriteFriendIds',
        'searchUsersByNickname', 'findExistingFriendship', 'setFriendFavorite',
        'findBlocksOwnedBy', 'deleteBlock',
        // 차단·해제의 잠금 순서와 "되살림 없음"을 확인하는 경계들.
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

// ---------------------------------------------------------------------------
// F-19 AC-03/AC-04 — 서버 즐겨찾기와 차단 제외가 실제 목록 경로에 반영되는가
// ---------------------------------------------------------------------------

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
        // 서버에 저장된 즐겨찾기는 friend-b 하나뿐이다.
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
        // 방향과 무관하게 차단 상대로 판정된 uuid를 돌려주는 경계다.
        findBlockedCounterpartUuids: async () => ['friend-b'],
    });
    stubEconomyService(t, {
        getPublicProfileLoadouts: async (uuids) => { loadoutQuery = uuids; return {}; },
    });

    const friends = await friendService.getFriendList('me');

    assert.deepEqual(friends.map((f) => f.id), ['friend-a']);
    // 차단 상대는 외형 조회 대상에서도 빠진다(불필요한 정보 조회를 하지 않는다).
    assert.deepEqual(loadoutQuery, ['friend-a']);
    // Friendship 원본 조회 결과 자체는 두 건 그대로였다 — 차단이 관계를 지우지 않는다.
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
    // presence 행이 없는 계정을 오프라인으로 **단정하지 않는다**.
    assert.notEqual(results[2].status, 'OFFLINE');
    // 검색 결과에도 실제 계정 외형이 실린다(기본 초상 고정이 아니다).
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

/**
 * db.sequelize.transaction을 이 시험 동안만 "콜백을 그대로 실행하는" 대역으로 바꾼다.
 *
 * 실제 SQL 없이도 **트랜잭션 경계 안에서 무엇을 어떤 순서로 했는지**는 확인할 수 있다.
 * 실제 잠금·격리 수준은 backend/tests/db/f19-friends-invites.integration.test.js가 실제
 * MySQL로 검증한다.
 */
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
            // 승인 계약: 계정쌍을 바꾸는 작업은 정규화 UUID **순서**로 잠근다. 순서가
            // 다르면 blockUser와 교착할 수 있고, 잠금 자체가 없으면 차단 트랜잭션과
            // 교차하는 창이 남는다.
            steps.push(['lock', [...uuids].sort().join('|'), options.transaction === tx.transaction]);
            return uuids.map((uuid) => ({ uuid, status: 'ACTIVE' }));
        },
        deleteBlock: async (ownerId, blockedId, options) => {
            steps.push(['delete', ownerId, blockedId, options?.transaction === tx.transaction]);
            // 실제 WHERE에 owner가 들어가므로 남의 차단은 0행이다.
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
        // 되살림이 있다면 반드시 이 중 하나를 지나야 한다.
        cancelPendingRequestsBetween: async () => { forbidden.push('requests'); },
        createFriendRequest: async () => { forbidden.push('create-request'); },
        updateFriendRequestStatus: async () => { forbidden.push('update-request'); },
        createFriendship: async () => { forbidden.push('friendship'); },
    });

    await friendService.unblockUser('owner', 'target');
    assert.deepEqual(forbidden, [], '해제만으로 CANCELLED가 PENDING으로 돌아가면 안 된다');
});
