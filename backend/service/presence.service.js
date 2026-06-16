/**
 * @file presence.service.js
 * @desc 유저 접속 상태(ONLINE/OFFLINE) DB 반영 및 브로드캐스트 대상 조회 서비스
 */

const friendRepository = require("../repositories/friend.repositories");

/**
 * 유저의 접속 상태를 DB에 Upsert합니다.
 * @param {string} uuid   - 상태를 변경할 유저 UUID
 * @param {string} status - 'ONLINE' | 'OFFLINE'
 * @returns {Promise<void>}
 */
exports.setPresence = async (uuid, status) => {
    await friendRepository.upsertOnlinePresence(uuid, status);
};

/**
 * ACCEPTED 상태인 친구들의 UUID 목록을 반환합니다.
 * Friendship은 양방향이므로 내가 requester인지 receiver인지에 따라 상대방 컬럼이 다릅니다.
 * @param {string} uuid - 기준 유저 UUID
 * @returns {Promise<string[]>}
 */
exports.getAcceptedFriendUuids = async (uuid) => {
    const friendships = await friendRepository.findFriendship(uuid);

    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.Friend2.uuid : friendship.Friend1.uuid;
    });
};
