const db = require("../models");
const friendRepository = require("../repositories/friend.repositories");
const economyService = require("../service/economy.service");
const notificationService = require("./notification.service");
const gameInviteService = require("./gameInvite.service");
const { createError } = require("../utils/appError");

const resolvePresenceStatus = (presence) => {
    if (!presence) return 'UNKNOWN';
    return presence.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
};

const loadPublicLoadouts = async (uuids) => {
    if (uuids.length === 0) return {};
    return await economyService.getPublicProfileLoadouts(uuids);
};

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

const assertNotBlocked = async (uuidA, uuidB, options = {}) => {
    const blocks = await friendRepository.findBlocksBetween(uuidA, uuidB, options);
    if (blocks.length > 0) {
        throw createError('차단된 사용자와는 친구 신청·게임 초대를 주고받을 수 없습니다.', 403);
    }
};

exports.assertNotBlocked = assertNotBlocked;

exports.sendFriendRequest = async (myUuid, receiverId) => {
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        throw createError('receiverId가 필요합니다.', 400);
    }
    if (myUuid === receiverId) {
        throw createError('자기 자신에게 친구 신청할 수 없습니다.', 400);
    }

    try {
        const { request, notification } = await db.sequelize.transaction(async (t) => {
            const [accountA, accountB] = await friendRepository.lockAccountsInOrder(
                [myUuid, receiverId], { transaction: t },
            );
            const accounts = [accountA, accountB];
            if (accounts.some((account) => !account)) {
                throw createError('사용자를 찾을 수 없습니다.', 404);
            }
            if (accounts.some((account) => account.status !== 'ACTIVE')) {
                throw createError('친구 신청을 보낼 수 없는 계정입니다.', 403);
            }

            await assertNotBlocked(myUuid, receiverId, { transaction: t });

            const existingFriendship = await friendRepository.findExistingFriendship(myUuid, receiverId);
            if (existingFriendship) {
                throw createError('이미 친구인 유저입니다.', 409);
            }

            const existingRequest = await friendRepository.findPendingRequest(myUuid, receiverId);
            if (existingRequest) {
                throw createError('이미 친구 신청 중입니다.', 409);
            }

            const created = await friendRepository.createFriendRequest(myUuid, receiverId, { transaction: t });

            const requester = await db.User.findOne({
                where: { uuid: myUuid }, attributes: ['nickname'], transaction: t,
            });

            const result = await notificationService.createFriendRequestNotification({
                receiverId,
                requestId: Number.isInteger(created?.id) ? created.id : Number(created?.id),
                requesterNickname: requester?.nickname ?? null,
            }, { db, transaction: t });

            return { request: created, notification: result.created ? result.notification : null };
        });

        if (notification !== null) notificationService.emitNotificationCreated(receiverId, notification);

        return request;
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw createError('이미 친구 신청 중입니다.', 409);
        }
        throw error;
    }
};

exports.acceptRequest = async (myUuid, requestId) => {
    return await db.sequelize.transaction(async (t) => {
        const identified = await friendRepository.findFriendRequestById(requestId);
        if (!identified) throw createError('친구 요청을 찾을 수 없습니다.', 404);

        await friendRepository.lockAccountsInOrder(
            [identified.requester_id, identified.receiver_id], { transaction: t },
        );

        const request = await friendRepository.findFriendRequestById(requestId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!request)                       throw createError('친구 요청을 찾을 수 없습니다.', 404);
        if (request.receiver_id !== myUuid) throw createError('권한이 없습니다.', 403);
        if (request.status !== 'PENDING')   throw createError('이미 처리된 요청입니다.', 409);

        await assertNotBlocked(request.requester_id, request.receiver_id, { transaction: t });

        await friendRepository.updateFriendRequestStatus(requestId, 'ACCEPTED', { transaction: t });

        const existingFriendship = await friendRepository.findExistingFriendship(
            request.requester_id, request.receiver_id,
        );
        if (!existingFriendship) {
            await friendRepository.createFriendship(request.requester_id, request.receiver_id, { transaction: t });
        }
        return { requesterId: request.requester_id };
    });
};

exports.declineRequest = async (myUuid, requestId) => {
    return await db.sequelize.transaction(async (t) => {
        const identified = await friendRepository.findFriendRequestById(requestId);
        if (!identified) throw createError('친구 요청을 찾을 수 없습니다.', 404);

        await friendRepository.lockAccountsInOrder(
            [identified.requester_id, identified.receiver_id], { transaction: t },
        );

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
    const uuids = requests.map((req) => req.Requester.uuid);

    const loadoutsByUuid = await loadPublicLoadouts(uuids);

    return requests.map(req => {
        const loadout = loadoutsByUuid[req.Requester.uuid] ?? { profilePhotoId: null, profileBorderId: null };
        return {
            request_id: req.id,
            id:         req.Requester.uuid,
            name:       req.Requester.nickname,
            profile:    req.Requester.profile_image_url || '/assets/default_profile.png',
            message:    req.message,
            created_at: req.created_at,
            accountProfilePhotoId:  loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
        };
    });
};

exports.getRequestResults = async (myUuid, requestIds) => {
    const ids = [...new Set(
        (Array.isArray(requestIds) ? requestIds : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
    )];
    if (ids.length === 0) return [];

    const rows = await friendRepository.findRequestResultsForUser(myUuid, ids);
    return rows.map((row) => ({
        request_id: row.id,
        status: row.status,
        responded_at: row.responded_at ?? null,
    }));
};

exports.getFavoriteFriendIds = async (myUuid) => {
    return await friendRepository.findFavoriteFriendIds(myUuid);
};

exports.setFriendFavorite = async (myUuid, friendId, desired) => {
    if (typeof friendId !== 'string' || friendId.length === 0) {
        throw createError('friendId가 필요합니다.', 400);
    }
    if (typeof desired !== 'boolean') {
        throw createError('favorite 값이 필요합니다.', 400);
    }
    if (friendId === myUuid) {
        throw createError('자기 자신을 즐겨찾기할 수 없습니다.', 400);
    }

    const friendship = await friendRepository.findExistingFriendship(myUuid, friendId);
    if (!friendship || friendship.status !== 'ACCEPTED') {
        throw createError('친구가 아닌 사용자는 즐겨찾기할 수 없습니다.', 404);
    }

    const favorite = await friendRepository.setFriendFavorite(myUuid, friendId, desired);
    return { friendId, favorite };
};

exports.getBlockedUsers = async (myUuid) => {
    const rows = await friendRepository.findBlocksOwnedBy(myUuid);
    const uuids = rows.map((row) => row.blocked_id);
    const loadoutsByUuid = await loadPublicLoadouts(uuids);

    return rows.map((row) => {
        const user = row.BlockedUser;
        const loadout = loadoutsByUuid[row.blocked_id] ?? { profilePhotoId: null, profileBorderId: null };
        return {
            id: row.blocked_id,
            name: user?.nickname ?? '알 수 없는 사용자',
            profile: user?.profile_image_url || '/assets/default_profile.png',
            blocked_at: row.created_at,
            accountProfilePhotoId: loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
        };
    });
};

exports.blockUser = async (myUuid, targetId) => {
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }
    if (targetId === myUuid) {
        throw createError('자기 자신을 차단할 수 없습니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        const [accountA, accountB] = await friendRepository.lockAccountsInOrder(
            [myUuid, targetId], { transaction: t },
        );
        if (!accountA || !accountB) throw createError('사용자를 찾을 수 없습니다.', 404);

        await friendRepository.createBlock(myUuid, targetId, { transaction: t });
        await friendRepository.cancelPendingRequestsBetween(myUuid, targetId, { transaction: t });
        const cancelledInvites = await gameInviteService.cancelPendingInvitesBetween(
            myUuid, targetId, 'BLOCKED', { db, transaction: t },
        );

        return { blockedId: targetId, cancelledInvites };
    });
};

exports.unblockUser = async (myUuid, targetId) => {
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        await friendRepository.lockAccountsInOrder([myUuid, targetId], { transaction: t });

        const removed = await friendRepository.deleteBlock(myUuid, targetId, { transaction: t });
        if (removed === 0) throw createError('차단 기록을 찾을 수 없습니다.', 404);

        return { unblockedId: targetId };
    });
};
