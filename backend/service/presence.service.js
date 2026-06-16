/**
 * @file    presence.service.js
 * @desc    유저의 실시간 접속 상태(ONLINE/OFFLINE)를 DB에 반영하고,
 *          상태 변경을 알려야 할 친구(수락된 Friendship) 목록을 조합하는 서비스 계층입니다.
 *          소켓 레이어(socket.js)는 이 서비스를 통해서만 DB에 접근합니다.
 */

const friendRepository = require("../repositories/friend.repositories");

// ──────────────────────────────────────────────
// 접속 상태(Presence) 갱신
// ──────────────────────────────────────────────

/**
 * @desc    특정 유저의 접속 상태를 DB에 Upsert합니다.
 *          소켓 connect 시 'ONLINE', disconnect 시 'OFFLINE'으로 호출됩니다.
 *
 * @param   {string} uuid   - 상태를 변경할 유저의 UUID
 * @param   {string} status - 'ONLINE' | 'OFFLINE'
 * @returns {Promise<void>}
 */
exports.setPresence = async (uuid, status) => {
    await friendRepository.upsertOnlinePresence(uuid, status);
};

// ──────────────────────────────────────────────
// 친구 목록 조회 (브로드캐스트 대상 산출용)
// ──────────────────────────────────────────────

/**
 * @desc    특정 유저와 'ACCEPTED' 상태로 친구인 상대방들의 UUID 목록을 반환합니다.
 *          Friendship은 양방향 관계이므로 내가 요청자(requester)인지 수락자(receiver)인지에 따라
 *          상대방을 가리키는 컬럼(Friend1/Friend2)이 달라지는 점에 유의합니다.
 *
 * @param   {string} uuid - 기준이 되는 유저의 UUID
 * @returns {Promise<string[]>} 친구들의 UUID 배열
 */
exports.getAcceptedFriendUuids = async (uuid) => {
    const friendships = await friendRepository.findFriendship(uuid);

    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.Friend2.uuid : friendship.Friend1.uuid;
    });
};
