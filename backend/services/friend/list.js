// 친구 목록 파일, 접속 상태 판정 · 공개 장착 · 친구 목록 · 닉네임 검색
// controllers/friend.controller.js가 index.js 거쳐 부름, blocks.js·requests.js가 공개 장착 씀
const friendshipRepository = require("../../repositories/friend/friendship");
const friendRequestRepository = require("../../repositories/friend/request");
const blockRepository = require("../../repositories/friend/block");
const onlinePresenceRepository = require("../../repositories/presence/onlinePresence");
const economyService = require("../economy");

// 검색 결과 접속 상태, 접속 행 없으면 UNKNOWN
const resolvePresenceStatus = (presence) => {
    if (!presence) return 'UNKNOWN';
    return presence.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
};

// 여러 사람 공개 장착 한 번에 (빈 목록이면 경제 서비스 안 부름)
const loadPublicLoadouts = async (uuids) => {
    if (uuids.length === 0) return {};
    return await economyService.getPublicProfileLoadouts(uuids);
};

// 친구 관계 + 접속 상태 + 즐겨찾기 + 공개 장착 합쳐 목록
exports.getFriendList = async (myUuid) => {
    const friendships = await friendshipRepository.findFriendship(myUuid);

    // 관계 행에서 내 쪽 말고 상대 계정 고름
    const friendInfos = friendships.map((f) => {
        const isRequester = f.requester_id === myUuid;
        return isRequester ? f.Friend2 : f.Friend1;
    });

    // 차단 관계인 친구는 숨김 (차단해도 친구 관계는 안 지우기 때문)
    const blockedUuids = new Set(await blockRepository.findBlockedCounterpartUuids(myUuid));
    const visibleFriends = friendInfos.filter((friend) => !blockedUuids.has(friend.uuid));

    const presences = await onlinePresenceRepository.findOnlinePresences(visibleFriends.map((f) => f.uuid));
    const presenceByUuid = new Map(presences.map((p) => [p.user_id, p]));

    const loadoutsByUuid = await loadPublicLoadouts(visibleFriends.map((f) => f.uuid));

    const favoriteIds = new Set(await blockRepository.findFavoriteFriendIds(myUuid));

    // 접속 행 없으면 OFFLINE (검색과 달리 UNKNOWN 안 씀), 장착 없으면 빈 값
    return visibleFriends.map((friendInfo) => {
        const presence = presenceByUuid.get(friendInfo.uuid);
        const loadout = loadoutsByUuid[friendInfo.uuid] ?? { profilePhotoId: null, profileBorderId: null };

        return {
            id:         friendInfo.uuid,
            name:       friendInfo.nickname,
            profile:    friendInfo.profile_image_url || '/assets/default_profile.png',
            status:     presence ? presence.status : 'OFFLINE',
            online:     presence ? presence.status !== 'OFFLINE' : false,
            isFavorite: favoriteIds.has(friendInfo.uuid),
            accountProfilePhotoId:  loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
        };
    });
};

// 닉네임 검색 (나·친구·보낸 대기 신청·차단 관계는 저장소가 뺌)
exports.searchUsers = async (query, myUuid) => {
    // 빈 검색어면 DB 안 감
    if (!query || query.trim().length < 1) return [];

    const users = await friendRequestRepository.searchUsersByNickname(query.trim(), myUuid);
    const uuids = users.map((u) => u.uuid);

    const [loadoutsByUuid, presences] = await Promise.all([
        loadPublicLoadouts(uuids),
        onlinePresenceRepository.findOnlinePresences(uuids),
    ]);
    const presenceByUuid = new Map(presences.map((p) => [p.user_id, p]));

    return users.map((u) => {
        const loadout = loadoutsByUuid[u.uuid] ?? { profilePhotoId: null, profileBorderId: null };
        const status = resolvePresenceStatus(presenceByUuid.get(u.uuid));
        return {
            id:      u.uuid,
            name:    u.nickname,
            profile: u.profile_image_url || '/assets/default_profile.png',
            status,
            accountProfilePhotoId:  loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
        };
    });
};

// blocks.js·requests.js가 같이 씀
exports.loadPublicLoadouts = loadPublicLoadouts;
