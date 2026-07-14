const db = require("../models");
const friendRepository = require("../repositories/friend.repositories");
const { createError } = require("../utils/appError");

exports.getFriendList = async (myUuid) => {
    const friendships = await friendRepository.findFriendship(myUuid);

    const friendInfos = friendships.map((f) => {
        const isRequester = f.requester_id === myUuid;
        return isRequester ? f.Friend2 : f.Friend1;
    });

    // 친구 수만큼 접속 상태를 따로 조회하는 대신 한 번의 IN 쿼리로 가져와서 uuid로 매칭합니다.
    const presences = await friendRepository.findOnlinePresences(friendInfos.map((f) => f.uuid));
    const presenceByUuid = new Map(presences.map((p) => [p.user_id, p]));

    return friendInfos.map((friendInfo) => {
        const presence = presenceByUuid.get(friendInfo.uuid);

        return {
            id:         friendInfo.uuid,
            name:       friendInfo.nickname,
            profile:    friendInfo.profile_image_url || '/assets/default_profile.png',
            status:     presence ? presence.status : 'OFFLINE',
            online:     presence ? presence.status !== 'OFFLINE' : false,
            isFavorite: false,
        };
    });
};

exports.searchUsers = async (query, myUuid) => {
    if (!query || query.trim().length < 1) return [];

    const users = await friendRepository.searchUsersByNickname(query.trim(), myUuid);
    return users.map(u => ({
        id:      u.uuid,
        name:    u.nickname,
        profile: u.profile_image_url || '/assets/default_profile.png',
    }));
};

exports.sendFriendRequest = async (myUuid, receiverId) => {
    if (myUuid === receiverId) {
        throw createError('자기 자신에게 친구 신청할 수 없습니다.', 400);
    }

    const existingFriendship = await friendRepository.findExistingFriendship(myUuid, receiverId);
    if (existingFriendship) {
        throw createError('이미 친구인 유저입니다.', 409);
    }

    const existingRequest = await friendRepository.findPendingRequest(myUuid, receiverId);
    if (existingRequest) {
        throw createError('이미 친구 신청 중입니다.', 409);
    }

    try {
        return await friendRepository.createFriendRequest(myUuid, receiverId);
    } catch (error) {
        // 위 검사와 INSERT 사이의 레이스(빠른 중복 클릭 등)로 동시에 두 요청이 통과했을 때,
        // DB 유니크 인덱스(requester_id, receiver_id, status)가 최후 방어선 역할을 합니다.
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw createError('이미 친구 신청 중입니다.', 409);
        }
        throw error;
    }
};

exports.acceptRequest = async (myUuid, requestId) => {
    // 트랜잭션 + 행 잠금(FOR UPDATE)으로 감싸서, 같은 요청에 대한 동시 수락 호출이
    // 서로의 커밋을 기다리게 만듭니다. 나중에 들어온 트랜잭션은 잠금이 풀린 뒤
    // status가 이미 바뀐 걸 보고 깨끗하게 409로 끝납니다 (unique 제약 위반 500 대신).
    return await db.sequelize.transaction(async (t) => {
        const request = await friendRepository.findFriendRequestById(requestId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!request)                       throw createError('친구 요청을 찾을 수 없습니다.', 404);
        if (request.receiver_id !== myUuid) throw createError('권한이 없습니다.', 403);
        if (request.status !== 'PENDING')   throw createError('이미 처리된 요청입니다.', 409);

        await friendRepository.updateFriendRequestStatus(requestId, 'ACCEPTED', { transaction: t });
        await friendRepository.createFriendship(request.requester_id, request.receiver_id, { transaction: t });
        return { requesterId: request.requester_id };
    });
};

exports.declineRequest = async (myUuid, requestId) => {
    return await db.sequelize.transaction(async (t) => {
        const request = await friendRepository.findFriendRequestById(requestId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!request)                       throw createError('친구 요청을 찾을 수 없습니다.', 404);
        if (request.receiver_id !== myUuid) throw createError('권한이 없습니다.', 403);
        if (request.status !== 'PENDING')   throw createError('이미 처리된 요청입니다.', 409);

        await friendRepository.updateFriendRequestStatus(requestId, 'DECLINED', { transaction: t });
        return { requesterId: request.requester_id };
    });
};

exports.getIncomingRequests = async (myUuid) => {
    const requests = await friendRepository.findIncomingRequests(myUuid);

    return requests.map(req => ({
        request_id: req.id,
        id:         req.Requester.uuid,
        name:       req.Requester.nickname,
        profile:    req.Requester.profile_image_url || '/assets/default_profile.png',
        message:    req.message,
        created_at: req.created_at,
    }));
};
