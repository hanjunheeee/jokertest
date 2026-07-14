const friendRepository = require("../repositories/friend.repositories");

exports.setPresence = async (uuid, status) => {
    await friendRepository.upsertOnlinePresence(uuid, status);
};

exports.getAcceptedFriendUuids = async (uuid) => {
    // 소켓 접속/해제마다 호출되는 경로라, 닉네임·프로필까지 조인하는 findFriendship 대신
    // uuid만 가져오는 가벼운 쿼리를 씁니다.
    const friendships = await friendRepository.findFriendshipUuidsOnly(uuid);

    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.receiver_id : friendship.requester_id;
    });
};
