/**
 * @file    friend.repositories.js
 * @desc    친구 관계·친구 요청·유저 검색 관련 DB 접근을 전담하는 레포지토리 계층입니다.
 *          Sequelize ORM을 직접 사용하며, 비즈니스 로직은 포함하지 않습니다.
 *
 *  사용 모델 목록
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  User           유저 기본 정보 (uuid, nickname, profile 등)       │
 *  │  Friendship     수락 완료된 양방향 친구 관계                       │
 *  │  FriendRequest  친구 신청 이력 (PENDING / ACCEPTED / DECLINED)    │
 *  │  OnlinePresence 실시간 접속 상태 (ONLINE / OFFLINE / IN_GAME)     │
 *  └──────────────────────────────────────────────────────────────────┘
 */

const db      = require("../models");
const { Op }  = db.Sequelize;

// ──────────────────────────────────────────────
// 친구 관계 (Friendship)
// ──────────────────────────────────────────────

/**
 * @desc    수락 완료된(ACCEPTED) 내 친구 관계를 모두 조회합니다.
 *          내가 요청자(requester)이거나 수락자(receiver)인 경우를 OR 조건으로 모두 가져오며,
 *          Friend1(요청자)과 Friend2(수락자) 모두 조인하여 반환합니다.
 *
 * @param   {string} uuid - 기준이 될 유저의 UUID
 * @returns {Promise<Array>} Friendship 모델 배열 (Friend1, Friend2 포함)
 */
exports.findFriendship = async (uuid) => {
    return await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED'
        },
        include: [
            { model: db.User, as: 'Friend1', attributes: ['uuid', 'nickname', 'profile_image_url'] },
            { model: db.User, as: 'Friend2', attributes: ['uuid', 'nickname', 'profile_image_url'] }
        ]
    });
};

/**
 * @desc    친구 요청이 수락된 후 Friendship 레코드를 생성합니다.
 *          단방향 레코드 하나만 저장하고, 서비스 계층에서 양방향으로 처리합니다.
 *
 * @param   {string} requesterId - 요청을 보낸 유저의 UUID
 * @param   {string} receiverId  - 요청을 받은 유저의 UUID
 * @returns {Promise<Object>} 생성된 Friendship Sequelize 인스턴스
 */
exports.createFriendship = async (requesterId, receiverId) => {
    return await db.Friendship.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'ACCEPTED'
    });
};

// ──────────────────────────────────────────────
// 친구 요청 (FriendRequest)
// ──────────────────────────────────────────────

/**
 * @desc    내가 받은 PENDING 상태의 친구 요청 목록을 조회합니다.
 *          Requester(신청자) 정보를 조인하여 함께 반환합니다.
 *
 * @param   {string} uuid - 수신자(나)의 UUID
 * @returns {Promise<Array>} FriendRequest 모델 배열 (Requester 포함)
 */
exports.findIncomingRequests = async (uuid) => {
    return await db.FriendRequest.findAll({
        where: { receiver_id: uuid, status: 'PENDING' },
        include: [{
            model:      db.User,
            as:         'Requester',
            attributes: ['uuid', 'nickname', 'profile_image_url']
        }]
    });
};

/**
 * @desc    두 유저 사이에 이미 PENDING 상태의 요청이 있는지 확인합니다.
 *          sendFriendRequest 서비스에서 중복 신청을 방지하기 위해 호출합니다.
 *
 * @param   {string} requesterId - 신청 발신자의 UUID
 * @param   {string} receiverId  - 신청 수신자의 UUID
 * @returns {Promise<Object|null>} PENDING 요청 객체 (없으면 null)
 */
exports.findPendingRequest = async (requesterId, receiverId) => {
    return await db.FriendRequest.findOne({
        where: { requester_id: requesterId, receiver_id: receiverId, status: 'PENDING' }
    });
};

/**
 * @desc    새로운 친구 요청 레코드를 PENDING 상태로 생성합니다.
 *
 * @param   {string} requesterId - 신청 발신자의 UUID
 * @param   {string} receiverId  - 신청 수신자의 UUID
 * @returns {Promise<Object>} 생성된 FriendRequest Sequelize 인스턴스
 */
exports.createFriendRequest = async (requesterId, receiverId) => {
    return await db.FriendRequest.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'PENDING'
    });
};

/**
 * @desc    PK(id)로 특정 친구 요청을 조회합니다.
 *          수락/거절 처리 전 요청의 존재 여부와 소유권(receiver_id)을 검증할 때 사용합니다.
 *
 * @param   {number} requestId - 조회할 FriendRequest의 PK
 * @returns {Promise<Object|null>} FriendRequest 객체 (없으면 null)
 */
exports.findFriendRequestById = async (requestId) => {
    return await db.FriendRequest.findOne({ where: { id: requestId } });
};

/**
 * @desc    친구 요청의 상태(status)와 처리 시각(responded_at)을 업데이트합니다.
 *          수락 시 'ACCEPTED', 거절 시 'DECLINED'를 전달합니다.
 *
 * @param   {number} requestId - 업데이트할 FriendRequest의 PK
 * @param   {string} status    - 변경할 상태값 ('ACCEPTED' | 'DECLINED')
 * @returns {Promise<Array>}   Sequelize update 결과 [변경된 행 수]
 */
exports.updateFriendRequestStatus = async (requestId, status) => {
    return await db.FriendRequest.update(
        { status, responded_at: new Date() },
        { where: { id: requestId } }
    );
};

// ──────────────────────────────────────────────
// 유저 검색 (User)
// ──────────────────────────────────────────────

/**
 * @desc    닉네임 부분 일치로 유저를 검색합니다. (최대 10명)
 *          아래 유저는 결과에서 제외됩니다:
 *            - 본인 (myUuid)
 *            - 이미 친구인 유저 (ACCEPTED Friendship 존재)
 *            - 이미 신청 중인 유저 (PENDING FriendRequest 존재)
 *          ACTIVE 상태의 유저만 반환하므로 탈퇴·정지 계정은 검색되지 않습니다.
 *
 * @param   {string} query  - 검색 키워드 (닉네임 부분 일치)
 * @param   {string} myUuid - 검색 요청자의 UUID (제외 목록 구성에 사용)
 * @returns {Promise<Array>} User 모델 배열 [{ uuid, nickname, profile_image_url }]
 */
exports.searchUsersByNickname = async (query, myUuid) => {
    // 이미 친구인 유저 UUID 목록
    const friendships = await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: myUuid }, { receiver_id: myUuid }],
            status: 'ACCEPTED'
        },
        attributes: ['requester_id', 'receiver_id']
    });
    const friendUuids = friendships.map(f =>
        f.requester_id === myUuid ? f.receiver_id : f.requester_id
    );

    // 이미 신청 보낸 유저 UUID 목록
    const pendingOut = await db.FriendRequest.findAll({
        where: { requester_id: myUuid, status: 'PENDING' },
        attributes: ['receiver_id']
    });
    const pendingUuids = pendingOut.map(r => r.receiver_id);

    // 본인 + 친구 + 신청 중인 유저를 통합해서 제외
    const excludeUuids = [myUuid, ...friendUuids, ...pendingUuids];

    return await db.User.findAll({
        where: {
            nickname: { [Op.like]: `%${query}%` },
            uuid:     { [Op.notIn]: excludeUuids },
            status:   'ACTIVE'
        },
        attributes: ['uuid', 'nickname', 'profile_image_url'],
        limit: 10
    });
};

// ──────────────────────────────────────────────
// 접속 상태 (OnlinePresence)
// ──────────────────────────────────────────────

/**
 * @desc    특정 유저의 현재 접속 상태를 조회합니다.
 *          레코드가 없으면 null을 반환하며, 서비스 계층에서 OFFLINE으로 처리합니다.
 *
 * @param   {string} userId - 조회 대상 유저의 UUID
 * @returns {Promise<Object|null>} OnlinePresence 객체 (없으면 null)
 */
exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({ where: { user_id: userId } });
};

/**
 * @desc    특정 유저의 접속 상태를 ONLINE/OFFLINE으로 생성 또는 갱신(Upsert)합니다.
 *          소켓 connect/disconnect 시점에 호출되며, 레코드가 없으면 새로 만들고 있으면 덮어씁니다.
 *
 * @param   {string} userId - 상태를 변경할 유저의 UUID
 * @param   {string} status - 변경할 상태값 ('ONLINE' | 'OFFLINE')
 * @returns {Promise<Array>} Sequelize upsert 결과
 */
exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id: userId,
        status,
        last_active_at: new Date()
    });
};
