'use strict';

// backend/models(→Sequelize)는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지
// 않는다 — roleStatistics.integration.test.js와 같은 관례).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'friend-service-public-profile-test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

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

const stubFriendRepository = (t, overrides) => {
    const keys = ['findFriendship', 'findOnlinePresences'];
    const originals = Object.fromEntries(keys.map((key) => [key, friendRepository[key]]));
    Object.assign(friendRepository, overrides);
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
