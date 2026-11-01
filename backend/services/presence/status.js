const friendshipRepository = require("../../repositories/friend/friendship");
const onlinePresenceRepository = require("../../repositories/presence/onlinePresence");

exports.setPresence = async (uuid, status) => {
    await onlinePresenceRepository.upsertOnlinePresence(uuid, status);
};

exports.getAcceptedFriendUuids = async (uuid) => {
    const friendships = await friendshipRepository.findFriendshipUuidsOnly(uuid);

    return friendships.map((friendship) => {
        const isRequester = friendship.requester_id === uuid;
        return isRequester ? friendship.receiver_id : friendship.requester_id;
    });
};
