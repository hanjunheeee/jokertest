/**
 * @file friend.repositories.js
 * @desc 친구 관계 · 친구 요청 · 유저 검색 · 접속 상태 DB 접근 레포지토리
 */

const db     = require("../models");
const { Op } = db.Sequelize;

/**
 * ACCEPTED 상태인 내 친구 관계를 모두 조회합니다. Friend1(requester)/Friend2(receiver) 조인 포함.
 * @param {string} uuid
 * @returns {Promise<Array>}
 */
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

/**
 * 친구 요청 수락 후 Friendship 레코드를 생성합니다.
 * @param {string} requesterId
 * @param {string} receiverId
 * @returns {Promise<Object>}
 */
exports.createFriendship = async (requesterId, receiverId) => {
    return await db.Friendship.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'ACCEPTED',
    });
};

/**
 * 내가 받은 PENDING 친구 요청 목록을 Requester 정보와 함께 조회합니다.
 * @param {string} uuid - 수신자(나)의 UUID
 * @returns {Promise<Array>}
 */
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

/**
 * 두 유저 사이에 PENDING 요청이 있는지 확인합니다. 양방향 모두 체크합니다.
 * @param {string} uuidA
 * @param {string} uuidB
 * @returns {Promise<Object|null>}
 */
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

/**
 * 두 유저 사이에 Friendship이 이미 존재하는지 확인합니다. 양방향 모두 체크합니다.
 * @param {string} uuidA
 * @param {string} uuidB
 * @returns {Promise<Object|null>}
 */
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

/**
 * 새 친구 요청 레코드를 PENDING 상태로 생성합니다.
 * @param {string} requesterId
 * @param {string} receiverId
 * @returns {Promise<Object>}
 */
exports.createFriendRequest = async (requesterId, receiverId) => {
    return await db.FriendRequest.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'PENDING',
    });
};

/**
 * PK로 특정 친구 요청을 조회합니다.
 * @param {number} requestId
 * @returns {Promise<Object|null>}
 */
exports.findFriendRequestById = async (requestId) => {
    return await db.FriendRequest.findOne({ where: { id: requestId } });
};

/**
 * 친구 요청의 상태와 responded_at을 업데이트합니다.
 * @param {number} requestId
 * @param {string} status - 'ACCEPTED' | 'DECLINED'
 * @returns {Promise<Array>}
 */
exports.updateFriendRequestStatus = async (requestId, status) => {
    return await db.FriendRequest.update(
        { status, responded_at: new Date() },
        { where: { id: requestId } }
    );
};

/**
 * 닉네임 부분 일치로 유저를 검색합니다. (최대 10명)
 * 본인, 이미 친구, 신청 중인 유저, 비활성 계정은 제외됩니다.
 * @param {string} query
 * @param {string} myUuid
 * @returns {Promise<Array>}
 */
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

/**
 * 특정 유저의 현재 접속 상태를 조회합니다. 레코드 없으면 null (= OFFLINE으로 처리).
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({ where: { user_id: userId } });
};

/**
 * 유저의 접속 상태를 생성 또는 덮어씁니다.
 * @param {string} userId
 * @param {string} status - 'ONLINE' | 'OFFLINE'
 * @returns {Promise<Array>}
 */
exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
    });
};
