/**
 * @file    friend.service.js
 * @desc    친구 기능의 비즈니스 로직을 담당하는 서비스 계층입니다.
 *          컨트롤러로부터 받은 uuid/id를 이용해 DB 조회·생성·수정을 처리하고
 *          프론트엔드에서 바로 쓸 수 있는 형태로 가공하여 반환합니다.
 *          DB 접근은 friend.repositories.js에만 의존합니다.
 */

const friendRepository = require("../repositories/friend.repositories");

// ──────────────────────────────────────────────
// 친구 목록 조회
// ──────────────────────────────────────────────

/**
 * @desc    수락 완료된 친구 목록과 각 친구의 현재 접속 상태를 조합해서 반환합니다.
 *          내가 요청자(requester)이면 Friend2 가 친구이고,
 *          내가 수락자(receiver)이면 Friend1 이 친구입니다.
 *
 * @param   {string} myUuid - 현재 로그인한 유저의 UUID
 * @returns {Promise<Array>} [{ id, name, profile, status, online, isFavorite }]
 */
exports.getFriendList = async (myUuid) => {
    // ACCEPTED 상태인 모든 Friendship 레코드 + Friend1/Friend2 조인 결과
    const friendships = await friendRepository.findFriendship(myUuid);

    const friendList = await Promise.all(friendships.map(async (f) => {
        // 양방향 관계이므로 내가 누구인지에 따라 상대방 포인터가 다름
        const isRequester = f.requester_id === myUuid;
        const friendInfo = isRequester ? f.Friend2 : f.Friend1;

        // 해당 친구의 현재 접속 상태를 별도 테이블에서 조회
        const presence = await friendRepository.findOnlinePresence(friendInfo.uuid);

        return {
            id:         friendInfo.uuid,
            name:       friendInfo.nickname,
            profile:    friendInfo.profile_image_url || '/assets/default_profile.png',
            status:     presence ? presence.status : 'OFFLINE',
            online:     presence ? presence.status !== 'OFFLINE' : false,
            isFavorite: false // 추후 is_favorite 컬럼 추가 시 연동
        };
    }));

    return friendList;
};

// ──────────────────────────────────────────────
// 유저 검색
// ──────────────────────────────────────────────

/**
 * @desc    닉네임 키워드로 유저를 검색합니다. (최대 10명)
 *          빈 쿼리이면 즉시 빈 배열을 반환하고,
 *          이미 친구 / 이미 신청한 대상 / 본인은 레포지토리 단에서 제외됩니다.
 *
 * @param   {string} query  - 검색 키워드 (닉네임 부분 일치)
 * @param   {string} myUuid - 검색 요청자의 UUID (자기 자신 제외용)
 * @returns {Promise<Array>} [{ id, name, profile }]
 */
exports.searchUsers = async (query, myUuid) => {
    if (!query || query.trim().length < 1) return [];

    const users = await friendRepository.searchUsersByNickname(query.trim(), myUuid);
    return users.map(u => ({
        id:      u.uuid,
        name:    u.nickname,
        profile: u.profile_image_url || '/assets/default_profile.png'
    }));
};

// ──────────────────────────────────────────────
// 친구 신청 전송
// ──────────────────────────────────────────────

/**
 * @desc    친구 신청을 전송합니다.
 *          두 가지 선행 검증을 통과해야 합니다:
 *            1) 자기 자신에게 신청 불가 (400)
 *            2) 이미 PENDING 상태인 요청이 있으면 중복 신청 불가 (409)
 *          통과 시 FriendRequest 레코드가 PENDING 상태로 생성됩니다.
 *
 * @param   {string} myUuid     - 신청 발신자의 UUID
 * @param   {string} receiverId - 신청 수신자의 UUID
 * @returns {Promise<Object>}   생성된 FriendRequest Sequelize 인스턴스
 * @throws  {Error} 400 — 자기 자신에게 신청
 * @throws  {Error} 409 — 이미 신청 중인 대상
 */
exports.sendFriendRequest = async (myUuid, receiverId) => {
    if (myUuid === receiverId) {
        const err = new Error('자기 자신에게 친구 신청할 수 없습니다.');
        err.status = 400;
        throw err;
    }

    const existing = await friendRepository.findPendingRequest(myUuid, receiverId);
    if (existing) {
        const err = new Error('이미 친구 신청을 보냈습니다.');
        err.status = 409;
        throw err;
    }

    return await friendRepository.createFriendRequest(myUuid, receiverId);
};

// ──────────────────────────────────────────────
// 친구 요청 수락
// ──────────────────────────────────────────────

/**
 * @desc    받은 친구 요청을 수락합니다.
 *          세 가지 검증을 통과해야 합니다:
 *            1) 요청이 존재하는지 확인 (404)
 *            2) 요청의 수신자가 나인지 확인 (403)
 *            3) 아직 PENDING 상태인지 확인 (409)
 *          통과 시 요청 상태를 ACCEPTED로 변경하고 Friendship 레코드를 생성합니다.
 *
 * @param   {string} myUuid    - 수락 요청자(나)의 UUID
 * @param   {number} requestId - FriendRequest 테이블의 PK
 * @returns {Promise<void>}
 * @throws  {Error} 404 — 요청 없음
 * @throws  {Error} 403 — 내가 받은 요청이 아님
 * @throws  {Error} 409 — 이미 처리된 요청
 */
exports.acceptRequest = async (myUuid, requestId) => {
    const request = await friendRepository.findFriendRequestById(requestId);

    if (!request) {
        const err = new Error('친구 요청을 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }
    if (request.receiver_id !== myUuid) {
        const err = new Error('권한이 없습니다.');
        err.status = 403;
        throw err;
    }
    if (request.status !== 'PENDING') {
        const err = new Error('이미 처리된 요청입니다.');
        err.status = 409;
        throw err;
    }

    await friendRepository.updateFriendRequestStatus(requestId, 'ACCEPTED');
    // 수락 완료 → 양방향 친구 관계(Friendship) 생성
    await friendRepository.createFriendship(request.requester_id, request.receiver_id);
};

// ──────────────────────────────────────────────
// 친구 요청 거절
// ──────────────────────────────────────────────

/**
 * @desc    받은 친구 요청을 거절합니다.
 *          acceptRequest 와 동일한 검증을 거치며, 성공 시 상태를 DECLINED로만 변경합니다.
 *          Friendship 레코드는 생성되지 않습니다.
 *
 * @param   {string} myUuid    - 거절 요청자(나)의 UUID
 * @param   {number} requestId - FriendRequest 테이블의 PK
 * @returns {Promise<void>}
 * @throws  {Error} 404 — 요청 없음
 * @throws  {Error} 403 — 내가 받은 요청이 아님
 * @throws  {Error} 409 — 이미 처리된 요청
 */
exports.declineRequest = async (myUuid, requestId) => {
    const request = await friendRepository.findFriendRequestById(requestId);

    if (!request) {
        const err = new Error('친구 요청을 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }
    if (request.receiver_id !== myUuid) {
        const err = new Error('권한이 없습니다.');
        err.status = 403;
        throw err;
    }
    if (request.status !== 'PENDING') {
        const err = new Error('이미 처리된 요청입니다.');
        err.status = 409;
        throw err;
    }

    await friendRepository.updateFriendRequestStatus(requestId, 'DECLINED');
};

// ──────────────────────────────────────────────
// 받은 친구 요청 목록
// ──────────────────────────────────────────────

/**
 * @desc    내가 받은 PENDING 상태의 친구 요청 목록을 반환합니다.
 *          각 요청에 신청자(Requester)의 기본 정보가 포함되어 있으며
 *          프론트엔드 FriendAcceptTab 컴포넌트에서 수락/거절 버튼을 렌더링할 때 사용합니다.
 *
 * @param   {string} myUuid - 현재 로그인한 유저의 UUID
 * @returns {Promise<Array>} [{ request_id, id, name, profile, message, created_at }]
 */
exports.getIncomingRequests = async (myUuid) => {
    const requests = await friendRepository.findIncomingRequests(myUuid);

    return requests.map(req => ({
        request_id: req.id,                    // 수락/거절 API에 사용할 FriendRequest PK
        id:         req.Requester.uuid,
        name:       req.Requester.nickname,
        profile:    req.Requester.profile_image_url || '/assets/default_profile.png',
        message:    req.message,
        created_at: req.created_at
    }));
};
