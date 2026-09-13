const db     = require("../models");
const { Op } = db.Sequelize;

exports.findFriendship = async (uuid) => {
    return await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED',
        },
        include: [
            { model: db.User, as: 'Friend1', attributes: ['uuid', 'nickname', 'profile_image_url'] },
            { model: db.User, as: 'Friend2', attributes: ['uuid', 'nickname', 'profile_image_url'] },
        ],
    });
};

// getAcceptedFriendUuids(소켓 접속/해제 브로드캐스트)는 uuid만 필요해서, 닉네임·프로필까지
// 조인하는 findFriendship 대신 이 가벼운 버전을 씁니다.
exports.findFriendshipUuidsOnly = async (uuid) => {
    return await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED',
        },
        attributes: ['requester_id', 'receiver_id'],
    });
};

// 친구 여러 명의 접속 상태를 한 번의 쿼리로 조회합니다 (친구 수만큼 쿼리를 따로 날리는 대신).
exports.findOnlinePresences = async (userIds) => {
    return await db.OnlinePresence.findAll({ where: { user_id: { [Op.in]: userIds } } });
};

exports.createFriendship = async (requesterId, receiverId, options = {}) => {
    return await db.Friendship.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'ACCEPTED',
    }, options);
};

exports.findIncomingRequests = async (uuid) => {
    return await db.FriendRequest.findAll({
        where: { receiver_id: uuid, status: 'PENDING' },
        include: [{
            model:      db.User,
            as:         'Requester',
            attributes: ['uuid', 'nickname', 'profile_image_url'],
        }],
    });
};

exports.findPendingRequest = async (uuidA, uuidB) => {
    return await db.FriendRequest.findOne({
        where: {
            [Op.or]: [
                { requester_id: uuidA, receiver_id: uuidB },
                { requester_id: uuidB, receiver_id: uuidA },
            ],
            status: 'PENDING',
        },
    });
};

exports.findExistingFriendship = async (uuidA, uuidB) => {
    return await db.Friendship.findOne({
        where: {
            [Op.or]: [
                { requester_id: uuidA, receiver_id: uuidB },
                { requester_id: uuidB, receiver_id: uuidA },
            ],
        },
    });
};

// F-17(A-02): options로 transaction을 받는다. 친구 요청 원본 행과 수신자 알림 행이 같은
// 트랜잭션에서 확정되어야, 알림 삽입이 실패했을 때 원본 요청도 함께 롤백된다
// (createFriendship·updateFriendRequestStatus가 이미 쓰는 것과 같은 options 관례).
exports.createFriendRequest = async (requesterId, receiverId, options = {}) => {
    return await db.FriendRequest.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'PENDING',
    }, options);
};

exports.findFriendRequestById = async (requestId, options = {}) => {
    return await db.FriendRequest.findOne({ where: { id: requestId }, ...options });
};

exports.updateFriendRequestStatus = async (requestId, status, options = {}) => {
    return await db.FriendRequest.update(
        { status, responded_at: new Date() },
        { where: { id: requestId }, ...options }
    );
};

exports.searchUsersByNickname = async (query, myUuid) => {
    const friendships = await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: myUuid }, { receiver_id: myUuid }],
            status: 'ACCEPTED',
        },
        attributes: ['requester_id', 'receiver_id'],
    });
    const friendUuids = friendships.map(f =>
        f.requester_id === myUuid ? f.receiver_id : f.requester_id
    );

    const pendingOut = await db.FriendRequest.findAll({
        where: { requester_id: myUuid, status: 'PENDING' },
        attributes: ['receiver_id'],
    });
    const pendingUuids = pendingOut.map(r => r.receiver_id);

    // F-19(AC-04): 어느 방향으로든 차단 관계인 계정은 후보에서 제외한다. 서버가 신청을
    // 거부할 대상을 화면에 "신청 가능"처럼 보여 주지 않기 위해서다. 누가 누구를 차단했는지는
    // 드러내지 않는다 — 그냥 결과에 없다.
    const blockedUuids = await exports.findBlockedCounterpartUuids(myUuid);

    const excludeUuids = [myUuid, ...friendUuids, ...pendingUuids, ...blockedUuids];

    return await db.User.findAll({
        where: {
            nickname: { [Op.like]: `%${query}%` },
            uuid:     { [Op.notIn]: excludeUuids },
            status:   'ACTIVE',
        },
        attributes: ['uuid', 'nickname', 'profile_image_url'],
        limit: 10,
    });
};

exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({ where: { user_id: userId } });
};

// ── F-19: 계정 잠금 순서 ─────────────────────────────────────────────────────

/**
 * 두 계정을 **정규화된 uuid 순서**로 잠근다(AC-04).
 *
 * 친구 신청·수락·거절·차단·해제·초대 생성/수락은 전부 "두 계정 사이의 쌍 변경"이라, 서로
 * 다른 순서로 잠그면 A→B 차단과 B→A 신청이 교차 대기하는 데드락이 난다. 정렬한 uuid 순서
 * 하나로 고정하면 어떤 조합이 동시에 들어와도 순환 대기가 생기지 않는다.
 *
 * 요청 ID로 상대를 알아내야 하는 경로(수락·거절)는 비잠금 조회로 **식별만** 한 뒤 이
 * 잠금을 잡고, 잠금 안에서 행·당사자·상태를 다시 확인해야 한다 — 비잠금 조회 결과를
 * 권한 근거로 쓰지 않는다.
 */
exports.lockAccountsInOrder = async (uuids, options = {}) => {
    const ordered = [...new Set(uuids.filter((uuid) => typeof uuid === 'string' && uuid.length > 0))].sort();
    const locked = [];
    for (const uuid of ordered) {
        // 한 번에 IN으로 잠그면 MySQL이 어떤 순서로 행 잠금을 잡을지 보장되지 않는다 —
        // 순서 보장이 이 함수의 존재 이유이므로 반드시 하나씩 순차로 잡는다.
        const row = await db.User.findOne({
            where: { uuid },
            attributes: ['uuid', 'status'],
            transaction: options.transaction,
            lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined,
        });
        locked.push(row);
    }
    return locked;
};

// ── F-19 AC-03: 즐겨찾기 ─────────────────────────────────────────────────────

exports.findFavoriteFriendIds = async (ownerId, options = {}) => {
    const rows = await db.FriendFavorite.findAll({
        where: { owner_id: ownerId },
        attributes: ['friend_id'],
        ...options,
    });
    return rows.map((row) => row.friend_id);
};

/**
 * 원하는 상태(true/false)를 그대로 저장한다 — toggle이 아니다(멱등).
 * 같은 PUT을 두 번 보내도 행은 하나이고, 결과도 같다.
 */
exports.setFriendFavorite = async (ownerId, friendId, desired, options = {}) => {
    if (desired) {
        await db.FriendFavorite.findOrCreate({
            where: { owner_id: ownerId, friend_id: friendId },
            defaults: { owner_id: ownerId, friend_id: friendId, created_at: new Date() },
            ...options,
        });
        return true;
    }
    await db.FriendFavorite.destroy({ where: { owner_id: ownerId, friend_id: friendId }, ...options });
    return false;
};

// ── F-19 AC-04/AC-05: 차단 ───────────────────────────────────────────────────

exports.findBlocksOwnedBy = async (ownerId, options = {}) => {
    return await db.FriendBlock.findAll({
        where: { owner_id: ownerId },
        include: [{ model: db.User, as: 'BlockedUser', attributes: ['uuid', 'nickname', 'profile_image_url'] }],
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        ...options,
    });
};

/** 어느 방향이든 차단 관계가 있으면 그 행들을 돌려준다(양방향 거부 판정의 근거). */
exports.findBlocksBetween = async (uuidA, uuidB, options = {}) => {
    return await db.FriendBlock.findAll({
        where: {
            [Op.or]: [
                { owner_id: uuidA, blocked_id: uuidB },
                { owner_id: uuidB, blocked_id: uuidA },
            ],
        },
        ...options,
    });
};

/** 이 계정과 어느 방향으로든 차단 관계인 상대 uuid 전부(목록·검색 제외에 쓴다). */
exports.findBlockedCounterpartUuids = async (uuid, options = {}) => {
    const rows = await db.FriendBlock.findAll({
        where: { [Op.or]: [{ owner_id: uuid }, { blocked_id: uuid }] },
        attributes: ['owner_id', 'blocked_id'],
        ...options,
    });
    return [...new Set(rows.map((row) => (row.owner_id === uuid ? row.blocked_id : row.owner_id)))];
};

exports.createBlock = async (ownerId, blockedId, options = {}) => {
    const [row] = await db.FriendBlock.findOrCreate({
        where: { owner_id: ownerId, blocked_id: blockedId },
        defaults: { owner_id: ownerId, blocked_id: blockedId, created_at: new Date() },
        ...options,
    });
    return row;
};

/** WHERE에 인증 owner를 강제한다 — 남의 차단은 어떤 경로로도 지워지지 않는다. */
exports.deleteBlock = async (ownerId, blockedId, options = {}) => {
    return await db.FriendBlock.destroy({
        where: { owner_id: ownerId, blocked_id: blockedId },
        ...options,
    });
};

/**
 * 이 계정쌍의 PENDING 친구 요청을 전부 CANCELLED로 확정한다(AC-05).
 * 차단 트랜잭션 안에서만 불린다 — 행을 지우지 않고 사유와 시각만 남긴다.
 */
exports.cancelPendingRequestsBetween = async (uuidA, uuidB, options = {}) => {
    return await db.FriendRequest.update(
        { status: 'CANCELLED', responded_at: new Date() },
        {
            where: {
                status: 'PENDING',
                [Op.or]: [
                    { requester_id: uuidA, receiver_id: uuidB },
                    { requester_id: uuidB, receiver_id: uuidA },
                ],
            },
            ...options,
        },
    );
};

/** 요청 당사자만 읽을 수 있는 결과 조회(AC-02의 응답 유실 재확인 경로). */
exports.findRequestResultsForUser = async (uuid, requestIds, options = {}) => {
    return await db.FriendRequest.findAll({
        where: {
            id: { [Op.in]: requestIds },
            // 요청자·수신자 어느 쪽도 아닌 계정은 결과를 볼 수 없다.
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
        },
        attributes: ['id', 'requester_id', 'receiver_id', 'status', 'responded_at'],
        ...options,
    });
};

exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
    });
};
