const db = require("../models");
const friendRepository = require("../repositories/friend.repositories");
const economyService = require("../service/economy.service");
const notificationService = require("./notification.service");
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

    // F-13 AC-05(운영자 확장 승인): 친구 목록에도 실제 장착 사진·테두리를 보여주기 위해
    // economyService.getPublicProfileLoadouts로 친구들의 appearance id만 일괄 조회한다 —
    // 지갑·소유 목록 등 비공개 경제 정보는 절대 섞이지 않는다(그 함수 자체의 계약).
    const loadoutsByUuid = await economyService.getPublicProfileLoadouts(friendInfos.map((f) => f.uuid));

    return friendInfos.map((friendInfo) => {
        const presence = presenceByUuid.get(friendInfo.uuid);
        const loadout = loadoutsByUuid[friendInfo.uuid] ?? { profilePhotoId: null, profileBorderId: null };

        return {
            id:         friendInfo.uuid,
            name:       friendInfo.nickname,
            profile:    friendInfo.profile_image_url || '/assets/default_profile.png',
            status:     presence ? presence.status : 'OFFLINE',
            online:     presence ? presence.status !== 'OFFLINE' : false,
            isFavorite: false,
            accountProfilePhotoId:  loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
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
        // F-17(A-02): 원본 요청 행과 수신자 알림 행을 **하나의** 트랜잭션에서 확정한다.
        // 알림 삽입이 실패하면 친구 요청도 함께 롤백되므로, "요청은 갔는데 알림만 없는"
        // 상태가 남지 않는다. 반대로 소켓 전달 실패는 커밋을 되돌리지 않는다 — 전달은
        // 커밋 **이후**에만 시도한다(아래).
        const { request, notification } = await db.sequelize.transaction(async (t) => {
            const created = await friendRepository.createFriendRequest(myUuid, receiverId, { transaction: t });

            // 알림 본문에 넣을 닉네임은 서버가 원본 계정 행에서 직접 읽는다 — 요청 본문의
            // 어떤 값도 알림 내용이 되지 않는다(A-01).
            const requester = await db.User.findOne({
                where: { uuid: myUuid }, attributes: ['nickname'], transaction: t,
            });

            const result = await notificationService.createFriendRequestNotification({
                receiverId,
                // create()가 채운 실제 PK를 쓴다. 값이 정수가 아니면 알림을 지어내지 않는다.
                requestId: Number.isInteger(created?.id) ? created.id : Number(created?.id),
                requesterNickname: requester?.nickname ?? null,
            }, { db, transaction: t });

            return { request: created, notification: result.created ? result.notification : null };
        });

        // 커밋 이후에만 전달한다(A-02: 롤백된 알림은 절대 전달되지 않는다). 예외는 서비스
        // 안에서 삼켜지므로 이미 커밋된 요청이 실패 응답으로 바뀌지 않는다.
        if (notification !== null) notificationService.emitNotificationCreated(receiverId, notification);

        return request;
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
