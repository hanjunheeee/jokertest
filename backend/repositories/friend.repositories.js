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

    const excludeUuids = [myUuid, ...friendUuids, ...pendingUuids];

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

exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
    });
};
