// 친구 목록 파일, 접속 상태 판정 · 공개 로드아웃 · 친구 목록 · 닉네임 검색
// friend 컨트롤러가 부름
const friendRepository = require("../../repositories/friend/relation");
const economyService = require("../economy");

// 접속 행 없으면 오프라인
const resolvePresenceStatus = (presence) => {
    if (!presence) return 'UNKNOWN';
    return presence.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
};

// 친구들 공개 장착을 한 번에
const loadPublicLoadouts = async (uuids) => {
    if (uuids.length === 0) return {};
    return await economyService.getPublicProfileLoadouts(uuids);
};

// 친구 관계 + 접속 상태 + 즐겨찾기 + 공개 장착 합쳐 목록
exports.getFriendList = async (myUuid) => {
    const friendships = await friendRepository.findFriendship(myUuid);

    const friendInfos = friendships.map((f) => {
        const isRequester = f.requester_id === myUuid;
        return isRequester ? f.Friend2 : f.Friend1;
    });

    const blockedUuids = new Set(await friendRepository.findBlockedCounterpartUuids(myUuid));
    const visibleFriends = friendInfos.filter((friend) => !blockedUuids.has(friend.uuid));

    const presences = await friendRepository.findOnlinePresences(visibleFriends.map((f) => f.uuid));
    const presenceByUuid = new Map(presences.map((p) => [p.user_id, p]));

    const loadoutsByUuid = await loadPublicLoadouts(visibleFriends.map((f) => f.uuid));

    const favoriteIds = new Set(await friendRepository.findFavoriteFriendIds(myUuid));

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

// 닉네임 검색, 나와 차단 관계인 사람은 뺌
exports.searchUsers = async (query, myUuid) => {
    if (!query || query.trim().length < 1) return [];

    const users = await friendRepository.searchUsersByNickname(query.trim(), myUuid);
    const uuids = users.map((u) => u.uuid);

    const [loadoutsByUuid, presences] = await Promise.all([
        loadPublicLoadouts(uuids),
        friendRepository.findOnlinePresences(uuids),
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

exports.loadPublicLoadouts = loadPublicLoadouts;
