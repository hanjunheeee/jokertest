// 친구 요청 파일, 보내기 · 수락 · 거절 · 받은 목록 · 결과
// 보낼 때 받는 사람 알림도 같은 트랜잭션에서 만듦
const db = require("../../repositories/common/db");
const friendRepository = require("../../repositories/friend/relation");
const notificationService = require("../notification");
const { createError } = require("../../utils/appError");
const { assertNotBlocked } = require('./blocks');
const { loadPublicLoadouts } = require('./list');
const userLookup = require('../../repositories/user/lookup');
const { withTransaction } = require('../../repositories/common');

// 두 계정 순서대로 잠금 → 상태·차단·이미 친구·이미 요청 확인 → 요청 + 알림
exports.sendFriendRequest = async (myUuid, receiverId) => {
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        throw createError('receiverId가 필요합니다.', 400);
    }
    if (myUuid === receiverId) {
        throw createError('자기 자신에게 친구 신청할 수 없습니다.', 400);
    }

    try {
        const { request, notification } = await withTransaction(db, async (t) => {
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

            const requester = await userLookup.findNickname(db, myUuid, t);

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

// 나에게 온 대기 요청만 수락, 친구 관계 만듦
exports.acceptRequest = async (myUuid, requestId) => {
    return await withTransaction(db, async (t) => {
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

// 나에게 온 대기 요청만 거절
exports.declineRequest = async (myUuid, requestId) => {
    return await withTransaction(db, async (t) => {
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

// 받은 대기 요청 목록
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

// 보낸 요청들 지금 상태 다시 묻기
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
