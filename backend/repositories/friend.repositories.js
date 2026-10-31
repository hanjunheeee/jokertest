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

exports.findFriendshipUuidsOnly = async (uuid) => {
    return await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED',
        },
        attributes: ['requester_id', 'receiver_id'],
    });
};

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

exports.findExistingFriendship = async (uuidA, uuidB, options = {}) => {
    return await db.Friendship.findOne({
        where: {
            [Op.or]: [
                { requester_id: uuidA, receiver_id: uuidB },
                { requester_id: uuidB, receiver_id: uuidA },
            ],
        },
        ...options,
    });
};

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

    const blockedUuids = await exports.findBlockedCounterpartUuids(myUuid);

    const excludeUuids = [myUuid, ...friendUuids, ...pendingUuids, ...blockedUuids];

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

exports.lockAccountsInOrder = async (uuids, options = {}) => {
    const ordered = [...new Set(uuids.filter((uuid) => typeof uuid === 'string' && uuid.length > 0))].sort();
    const locked = [];
    for (const uuid of ordered) {
        const row = await db.User.findOne({
            where: { uuid },
            attributes: ['uuid', 'status'],
            transaction: options.transaction,
            lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined,
        });
        locked.push(row);
    }
    return locked;
};

exports.findFavoriteFriendIds = async (ownerId, options = {}) => {
    const rows = await db.FriendFavorite.findAll({
        where: { owner_id: ownerId },
        attributes: ['friend_id'],
        ...options,
    });
    return rows.map((row) => row.friend_id);
};

exports.setFriendFavorite = async (ownerId, friendId, desired, options = {}) => {
    if (desired) {
        await db.FriendFavorite.findOrCreate({
            where: { owner_id: ownerId, friend_id: friendId },
            defaults: { owner_id: ownerId, friend_id: friendId, created_at: new Date() },
            ...options,
        });
        return true;
    }
    await db.FriendFavorite.destroy({ where: { owner_id: ownerId, friend_id: friendId }, ...options });
    return false;
};

exports.findBlocksOwnedBy = async (ownerId, options = {}) => {
    return await db.FriendBlock.findAll({
        where: { owner_id: ownerId },
        include: [{ model: db.User, as: 'BlockedUser', attributes: ['uuid', 'nickname', 'profile_image_url'] }],
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        ...options,
    });
};

exports.findBlocksBetween = async (uuidA, uuidB, options = {}) => {
    return await db.FriendBlock.findAll({
        where: {
            [Op.or]: [
                { owner_id: uuidA, blocked_id: uuidB },
                { owner_id: uuidB, blocked_id: uuidA },
            ],
        },
        ...options,
    });
};

exports.findBlockedCounterpartUuids = async (uuid, options = {}) => {
    const rows = await db.FriendBlock.findAll({
        where: { [Op.or]: [{ owner_id: uuid }, { blocked_id: uuid }] },
        attributes: ['owner_id', 'blocked_id'],
        ...options,
    });
    return [...new Set(rows.map((row) => (row.owner_id === uuid ? row.blocked_id : row.owner_id)))];
};

exports.createBlock = async (ownerId, blockedId, options = {}) => {
    const [row] = await db.FriendBlock.findOrCreate({
        where: { owner_id: ownerId, blocked_id: blockedId },
        defaults: { owner_id: ownerId, blocked_id: blockedId, created_at: new Date() },
        ...options,
    });
    return row;
};

exports.deleteBlock = async (ownerId, blockedId, options = {}) => {
    return await db.FriendBlock.destroy({
        where: { owner_id: ownerId, blocked_id: blockedId },
        ...options,
    });
};

exports.cancelPendingRequestsBetween = async (uuidA, uuidB, options = {}) => {
    return await db.FriendRequest.update(
        { status: 'CANCELLED', responded_at: new Date() },
        {
            where: {
                status: 'PENDING',
                [Op.or]: [
                    { requester_id: uuidA, receiver_id: uuidB },
                    { requester_id: uuidB, receiver_id: uuidA },
                ],
            },
            ...options,
        },
    );
};

exports.findRequestResultsForUser = async (uuid, requestIds, options = {}) => {
    return await db.FriendRequest.findAll({
        where: {
            id: { [Op.in]: requestIds },
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
        },
        attributes: ['id', 'requester_id', 'receiver_id', 'status', 'responded_at'],
        ...options,
    });
};

exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
    });
};
