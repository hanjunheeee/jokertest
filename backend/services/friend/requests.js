// 친구 요청 파일, 보내기 · 수락 · 거절 · 받은 목록 · 결과
// controllers/friend.controller.js가 index.js 거쳐 부름, 보낼 때 받는 사람 알림도 같은 트랜잭션에서 만듦
const db = require("../../repositories/common/db");
const friendshipRepository = require("../../repositories/friend/friendship");
const friendRequestRepository = require("../../repositories/friend/request");
const notificationService = require("../notification");
const { createError } = require("../../utils/appError");
const { assertNotBlocked } = require('./blocks');
const { loadPublicLoadouts } = require('./list');
const userLookup = require('../../repositories/user/lookup');
const { withTransaction } = require('../../repositories/common');

// 두 계정 순서대로 잠금 → 상태·차단·이미 친구·이미 요청 확인 → 요청 + 알림
exports.sendFriendRequest = async (myUuid, receiverId) => {
    // 받는 사람 없거나 나 자신이면 거절
    if (typeof receiverId !== 'string' || receiverId.length === 0) {
        throw createError('receiverId가 필요합니다.', 400);
    }
    if (myUuid === receiverId) {
        throw createError('자기 자신에게 친구 신청할 수 없습니다.', 400);
    }

    try {
        const { request, notification } = await withTransaction(db, async (t) => {
            // 두 계정 순서대로 잠금 (동시 신청 엇갈림 막기), 없으면 404 · 활성 아니면 403
            const [accountA, accountB] = await friendshipRepository.lockAccountsInOrder(
                [myUuid, receiverId], { transaction: t },
            );
            const accounts = [accountA, accountB];
            if (accounts.some((account) => !account)) {
                throw createError('사용자를 찾을 수 없습니다.', 404);
            }
            if (accounts.some((account) => account.status !== 'ACTIVE')) {
                throw createError('친구 신청을 보낼 수 없는 계정입니다.', 403);
            }

            // 둘 중 누가 차단했으면 403
            await assertNotBlocked(myUuid, receiverId, { transaction: t });

            // 이미 친구거나 어느 쪽이든 대기 신청 있으면 409
            const existingFriendship = await friendshipRepository.findExistingFriendship(myUuid, receiverId);
            if (existingFriendship) {
                throw createError('이미 친구인 유저입니다.', 409);
            }

            const existingRequest = await friendRequestRepository.findPendingRequest(myUuid, receiverId);
            if (existingRequest) {
                throw createError('이미 친구 신청 중입니다.', 409);
            }

            // 여기부터 진짜 바뀜: 신청 행 → 보낸 사람 닉네임으로 받는 사람 알림
            const created = await friendRequestRepository.createFriendRequest(myUuid, receiverId, { transaction: t });

            const requester = await userLookup.findNickname(db, myUuid, t);

            // 알림 출처 키에 요청 id 숫자 씀 (숫자 아니면 알림 안 만들어짐)
            const result = await notificationService.createForFriendRequest({
                receiverId,
                requestId: Number.isInteger(created?.id) ? created.id : Number(created?.id),
                requesterNickname: requester?.nickname ?? null,
            }, { db, transaction: t });

            return { request: created, notification: result.created ? result.notification : null };
        });

        // 커밋 뒤에만 알림 전송 (되돌려진 알림 안 보내기)
        if (notification !== null) notificationService.emitNotificationCreated(receiverId, notification);

        return request;
    } catch (error) {
        // 동시 신청이 유일 제약에 걸리면 409로 바꿈
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw createError('이미 친구 신청 중입니다.', 409);
        }
        throw error;
    }
};

// 나에게 온 대기 요청만 수락, 친구 관계 만듦
exports.acceptRequest = async (myUuid, requestId) => {
    return await withTransaction(db, async (t) => {
        // 잠글 두 계정 알려고 먼저 잠금 없이 읽음, 없으면 404
        const identified = await friendRequestRepository.findRequestById(requestId);
        if (!identified) throw createError('친구 요청을 찾을 수 없습니다.', 404);

        // 두 계정 순서대로 잠금 (보내기·차단과 같은 순서라 교착 막기)
        await friendshipRepository.lockAccountsInOrder(
            [identified.requester_id, identified.receiver_id], { transaction: t },
        );

        // 잠근 뒤 다시 읽음 (그사이 처리됐는지 보려고)
        const request = await friendRequestRepository.findRequestById(requestId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        // 내가 받은 대기 요청 아니면 거절
        if (!request)                       throw createError('친구 요청을 찾을 수 없습니다.', 404);
        if (request.receiver_id !== myUuid) throw createError('권한이 없습니다.', 403);
        if (request.status !== 'PENDING')   throw createError('이미 처리된 요청입니다.', 409);

        // 그사이 차단됐으면 403
        await assertNotBlocked(request.requester_id, request.receiver_id, { transaction: t });

        // 여기부터 진짜 바뀜: 수락 표시 → 친구 관계 없을 때만 만듦
        await friendRequestRepository.updateFriendRequestStatus(requestId, 'ACCEPTED', { transaction: t });

        const existingFriendship = await friendshipRepository.findExistingFriendship(
            request.requester_id, request.receiver_id,
        );
        if (!existingFriendship) {
            await friendshipRepository.createFriendship(request.requester_id, request.receiver_id, { transaction: t });
        }
        return { requesterId: request.requester_id };
    });
};

// 나에게 온 대기 요청만 거절
exports.declineRequest = async (myUuid, requestId) => {
    return await withTransaction(db, async (t) => {
        // 잠글 두 계정 알려고 먼저 잠금 없이 읽음, 없으면 404
        const identified = await friendRequestRepository.findRequestById(requestId);
        if (!identified) throw createError('친구 요청을 찾을 수 없습니다.', 404);

        // 수락과 같은 순서로 두 계정 잠금
        await friendshipRepository.lockAccountsInOrder(
            [identified.requester_id, identified.receiver_id], { transaction: t },
        );

        // 잠근 뒤 다시 읽음 (그사이 처리됐는지 보려고)
        const request = await friendRequestRepository.findRequestById(requestId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        // 내가 받은 대기 요청 아니면 거절
        if (!request)                       throw createError('친구 요청을 찾을 수 없습니다.', 404);
        if (request.receiver_id !== myUuid) throw createError('권한이 없습니다.', 403);
        if (request.status !== 'PENDING')   throw createError('이미 처리된 요청입니다.', 409);

        // 여기부터 진짜 바뀜: 거절 표시
        await friendRequestRepository.updateFriendRequestStatus(requestId, 'DECLINED', { transaction: t });
        return { requesterId: request.requester_id };
    });
};

// 받은 대기 요청 목록 + 보낸 사람 공개 장착
exports.getIncomingRequests = async (myUuid) => {
    const requests = await friendRequestRepository.findIncomingRequests(myUuid);
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

// 요청들 지금 상태 다시 묻기 (내가 보냈거나 받은 것만)
exports.getRequestResults = async (myUuid, requestIds) => {
    // 양의 정수 id만 겹침 없이, 하나도 없으면 DB 안 감
    const ids = [...new Set(
        (Array.isArray(requestIds) ? requestIds : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
    )];
    if (ids.length === 0) return [];

    const rows = await friendRequestRepository.findRequestResults(myUuid, ids);
    return rows.map((row) => ({
        request_id: row.id,
        status: row.status,
        responded_at: row.responded_at ?? null,
    }));
};
