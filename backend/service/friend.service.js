const db = require("../models");
const friendRepository = require("../repositories/friend.repositories");
const economyService = require("../service/economy.service");
const notificationService = require("./notification.service");
const gameInviteService = require("./gameInvite.service");
const { createError } = require("../utils/appError");

/**
 * 접속 상태를 세 값 중 하나로 확정한다(F-19 AC-01).
 *
 * presence 행이 아예 없는 계정은 "오프라인"이 아니라 **모른다**. 예전 검색 결과는 그 구분
 * 없이 항상 오프라인으로 단정해서, 실제로는 접속 중인 사용자도 회색으로 보였다.
 */
const resolvePresenceStatus = (presence) => {
    if (!presence) return 'UNKNOWN';
    return presence.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
};

/** 계정 목록의 공개 외형(사진·테두리)만 한 번에 조회한다. 비공개 경제 정보는 섞이지 않는다. */
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

    // F-19(AC-04/AC-05): 차단 관계인 상대는 일반 목록에서 뺀다. Friendship 행 자체는 그대로
    // 남아 있으므로(차단은 관계를 삭제하지 않는다) 차단을 해제하면 여기 다시 나타난다.
    const blockedUuids = new Set(await friendRepository.findBlockedCounterpartUuids(myUuid));
    const visibleFriends = friendInfos.filter((friend) => !blockedUuids.has(friend.uuid));

    // 친구 수만큼 접속 상태를 따로 조회하는 대신 한 번의 IN 쿼리로 가져와서 uuid로 매칭합니다.
    const presences = await friendRepository.findOnlinePresences(visibleFriends.map((f) => f.uuid));
    const presenceByUuid = new Map(presences.map((p) => [p.user_id, p]));

    // F-13 AC-05(운영자 확장 승인): 친구 목록에도 실제 장착 사진·테두리를 보여주기 위해
    // economyService.getPublicProfileLoadouts로 친구들의 appearance id만 일괄 조회한다 —
    // 지갑·소유 목록 등 비공개 경제 정보는 절대 섞이지 않는다(그 함수 자체의 계약).
    const loadoutsByUuid = await loadPublicLoadouts(visibleFriends.map((f) => f.uuid));

    // F-19(AC-03): 즐겨찾기는 **서버가 소유한 계정별 값**이다. 화면의 별 상태는 이 응답과
    // GET /friends/favorites가 함께 복원하므로, 다른 브라우저·재접속에서도 같은 값이 나온다.
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

    // F-19(AC-01): 검색 결과도 실제 계정 외형과 실제 접속 상태를 함께 내려준다 — 예전에는
    // 둘 다 없어서 모든 후보가 기본 초상 + "오프라인"으로 보였다.
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

/**
 * 두 계정이 지금 서로 무언가를 보낼 수 있는 사이인지 확인한다(AC-04).
 *
 * 어느 방향의 차단이든 **양방향**으로 막는다 — 차단당한 쪽도 차단한 쪽에게 신청·초대를
 * 보낼 수 없다. 누가 차단했는지는 응답에 드러내지 않는다(상대의 차단 사실 자체가 새어
 * 나가지 않도록 같은 문구를 쓴다).
 *
 * 호출자가 잠금 트랜잭션을 넘기면 그 안에서 다시 확인한다 — 비잠금 사전 검사는 사용자
 * 안내용이고, 권한 판정은 반드시 잠금 안의 이 호출이다.
 */
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
        // F-17(A-02): 원본 요청 행과 수신자 알림 행을 **하나의** 트랜잭션에서 확정한다.
        // 알림 삽입이 실패하면 친구 요청도 함께 롤백되므로, "요청은 갔는데 알림만 없는"
        // 상태가 남지 않는다. 반대로 소켓 전달 실패는 커밋을 되돌리지 않는다 — 전달은
        // 커밋 **이후**에만 시도한다(아래).
        //
        // F-19(AC-04): 존재·차단·중복 검사를 전부 **정렬 uuid 잠금 안에서** 다시 한다.
        // 예전에는 잠금 없이 검사한 뒤 INSERT해서, A→B 차단과 B→A 신청이 동시에 들어오면
        // 차단된 뒤에도 요청이 생길 수 있었다.
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
        // 0013이 건 pending_pair_key 유일 인덱스가 최후 방어선 역할을 합니다 — 같은 방향의
        // 재신청뿐 아니라 교차 방향 동시 신청도 여기서 하나로 좁혀집니다.
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
    //
    // F-19(AC-04): 요청 행만 잠그면 "차단 커밋 → 수락"의 교차를 막지 못한다. 상대를 알아야
    // 계정을 잠글 수 있으므로 **비잠금 조회로 식별만** 한 뒤, 정렬 계정 잠금 → 요청 행 잠금
    // 순서로 다시 잡고 그 안에서 당사자·상태·차단을 전부 재확인한다.
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

        // 잠금 안에서 양방향 기존 관계를 다시 확인한다 — 교차 방향 요청 두 개가 동시에
        // 수락돼 Friendship이 두 행 생기는 것을 막는다(0013의 무방향 PENDING 유일 제약이
        // 정상 경로에서는 이미 막지만, 이 재확인은 그 제약이 없는 과거 행에도 적용된다).
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

    // F-19(AC-01): 받은 요청 행도 실제 계정 외형을 함께 내려준다(로비·대기방의 같은 행
    // 컴포넌트가 기본 초상 대신 실제 사진·테두리를 그릴 수 있게).
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

/**
 * F-19 AC-02: 요청 **당사자만** 자기 요청들의 현재 상태를 조회한다.
 *
 * 전체 수락의 응답이 유실됐을 때 화면이 "성공인지 실패인지" 임의로 단정하지 않고 서버에
 * 되물을 수 있는 유일한 경로다. 남의 요청 id를 섞어 보내도 그 행은 결과에 없다.
 */
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

// ── F-19 AC-03: 즐겨찾기 ─────────────────────────────────────────────────────

exports.getFavoriteFriendIds = async (myUuid) => {
    return await friendRepository.findFavoriteFriendIds(myUuid);
};

/**
 * 즐겨찾기를 **원하는 값 그대로** 저장한다(멱등).
 *
 * toggle 명령이 아니라 desired(true/false)를 받는 이유는 재전송 때문이다 — 응답이 유실돼
 * 클라이언트가 같은 요청을 다시 보내도 결과가 뒤집히지 않는다.
 *
 * 소유 계정과 **실제 친구 관계**를 서버가 확인한다. 친구가 아닌 계정을 즐겨찾기로 저장할
 * 수 없고, 다른 계정의 즐겨찾기는 어떤 경로로도 바꿀 수 없다(owner_id는 인증 uuid 고정).
 */
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

// ── F-19 AC-04/AC-05: 차단 ───────────────────────────────────────────────────

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

/**
 * 상대를 차단한다(AC-04) — 그리고 같은 트랜잭션에서 미처리 친구 요청·게임 초대를
 * 무효화한다(AC-05).
 *
 * 보존하는 것과 없애는 것을 분명히 나눈다:
 *   - 보존: 기존 Friendship 행, 즐겨찾기 원본, 이미 종료된 요청·초대 이력.
 *   - 무효화: 이 계정쌍의 PENDING 친구 요청과 PENDING 게임 초대(CANCELLED + 사유 + revision).
 *
 * 해제는 차단 관계 행만 지운다 — CANCELLED가 PENDING으로 되돌아가지 않는다.
 * 통지는 **커밋 이후에** 한다. SQL 잠금을 쥔 채로 room coordinator나 소켓 전달을 기다리지
 * 않는다.
 */
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

    // WHERE에 인증 owner를 강제한다 — 상대(B)가 A의 차단을 지우려 해도 조건에 맞는 행이
    // 없어 아무것도 바뀌지 않는다. 존재하지 않는 차단과 남의 차단을 구분하지 않는다.
    const removed = await friendRepository.deleteBlock(myUuid, targetId);
    if (removed === 0) throw createError('차단 기록을 찾을 수 없습니다.', 404);

    // 해제는 차단 관계만 없앤다. 차단 시점에 CANCELLED로 확정된 요청·초대는 그대로 둔다.
    return { unblockedId: targetId };
};
