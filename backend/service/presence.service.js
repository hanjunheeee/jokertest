const friendRepository = require("../repositories/friend.repositories");

exports.setPresence = async (uuid, status) => {
    await friendRepository.upsertOnlinePresence(uuid, status);
};

exports.getAcceptedFriendUuids = async (uuid) => {
    const friendships = await friendRepository.findFriendshipUuidsOnly(uuid);

    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.receiver_id : friendship.requester_id;
    });
};
