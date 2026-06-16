/**
 * @file friend.service.js
 * @desc 친구 목록 조회 · 검색 · 요청 전송/수락/거절 비즈니스 로직 서비스
 */

const friendRepository = require("../repositories/friend.repositories");

/**
 * ACCEPTED 친구 목록과 각 친구의 접속 상태를 조합해 반환합니다.
 * @param {string} myUuid
 * @returns {Promise<Array<{ id, name, profile, status, online, isFavorite }>>}
 */
exports.getFriendList = async (myUuid) => {
    const friendships = await friendRepository.findFriendship(myUuid);

    return Promise.all(friendships.map(async (f) => {
        // Friendship은 양방향 — 내가 requester면 상대는 Friend2, receiver면 Friend1
        const isRequester = f.requester_id === myUuid;
        const friendInfo  = isRequester ? f.Friend2 : f.Friend1;
        const presence    = await friendRepository.findOnlinePresence(friendInfo.uuid);

        return {
            id:         friendInfo.uuid,
            name:       friendInfo.nickname,
            profile:    friendInfo.profile_image_url || '/assets/default_profile.png',
            status:     presence ? presence.status : 'OFFLINE',
            online:     presence ? presence.status !== 'OFFLINE' : false,
            isFavorite: false,
        };
    }));
};

/**
 * 닉네임 키워드로 유저를 검색합니다. (최대 10명)
 * 빈 쿼리, 이미 친구, 신청 중인 대상, 본인은 제외됩니다.
 * @param {string} query
 * @param {string} myUuid
 * @returns {Promise<Array<{ id, name, profile }>>}
 */
exports.searchUsers = async (query, myUuid) => {
    if (!query || query.trim().length < 1) return [];

    const users = await friendRepository.searchUsersByNickname(query.trim(), myUuid);
    return users.map(u => ({
        id:      u.uuid,
        name:    u.nickname,
        profile: u.profile_image_url || '/assets/default_profile.png',
    }));
};

/**
 * 친구 신청을 전송합니다.
 * @param {string} myUuid
 * @param {string} receiverId
 * @returns {Promise<Object>} 생성된 FriendRequest 인스턴스
 * @throws {Error} 400 — 자기 자신에게 신청
 * @throws {Error} 409 — 이미 신청 중
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

/**
 * 받은 친구 요청을 수락하고 Friendship 레코드를 생성합니다.
 * @param {string} myUuid
 * @param {number} requestId
 * @returns {Promise<void>}
 * @throws {Error} 404 — 요청 없음 | 403 — 권한 없음 | 409 — 이미 처리됨
 */
exports.acceptRequest = async (myUuid, requestId) => {
    const request = await friendRepository.findFriendRequestById(requestId);

    if (!request)                      { const e = new Error('친구 요청을 찾을 수 없습니다.'); e.status = 404; throw e; }
    if (request.receiver_id !== myUuid){ const e = new Error('권한이 없습니다.');              e.status = 403; throw e; }
    if (request.status !== 'PENDING')  { const e = new Error('이미 처리된 요청입니다.');        e.status = 409; throw e; }

    await friendRepository.updateFriendRequestStatus(requestId, 'ACCEPTED');
    await friendRepository.createFriendship(request.requester_id, request.receiver_id);
};

/**
 * 받은 친구 요청을 거절합니다. (Friendship 생성 없음)
 * @param {string} myUuid
 * @param {number} requestId
 * @returns {Promise<void>}
 * @throws {Error} 404 — 요청 없음 | 403 — 권한 없음 | 409 — 이미 처리됨
 */
exports.declineRequest = async (myUuid, requestId) => {
    const request = await friendRepository.findFriendRequestById(requestId);

    if (!request)                      { const e = new Error('친구 요청을 찾을 수 없습니다.'); e.status = 404; throw e; }
    if (request.receiver_id !== myUuid){ const e = new Error('권한이 없습니다.');              e.status = 403; throw e; }
    if (request.status !== 'PENDING')  { const e = new Error('이미 처리된 요청입니다.');        e.status = 409; throw e; }

    await friendRepository.updateFriendRequestStatus(requestId, 'DECLINED');
};

/**
 * 내가 받은 PENDING 친구 요청 목록을 반환합니다.
 * @param {string} myUuid
 * @returns {Promise<Array<{ request_id, id, name, profile, message, created_at }>>}
 */
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
