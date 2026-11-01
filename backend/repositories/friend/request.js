// 친구 신청 저장소 파일, 신청 찾기·만들기·상태 바꾸기·취소 + 신청 대상 닉네임 검색
// 친구 서비스(requests·list·blocks)가 모듈 객체로 부름 (시험이 이 객체 함수를 바꿔 끼움)

const db     = require("../../models");
const { Op } = db.Sequelize;

// 검색에서 차단 관계 빼기용, 모듈 객체로 부름 (시험이 block.js 함수를 바꿔 끼워도 먹게)
const blockRepository = require("./block");

// 나에게 온 대기 신청 + 보낸 사람 프로필
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

// 두 사람 사이 대기 신청 하나, 누가 보냈든 (겹친 신청 막기)
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

// 대기 신청 한 줄 만들기 (두 사람 사이 대기는 DB가 한 줄만 받음)
exports.createFriendRequest = async (requesterId, receiverId, options = {}) => {
    return await db.FriendRequest.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'PENDING',
    }, options);
};

// id로 신청 하나 (잠금 옵션은 부르는 쪽이 넘김)
exports.findRequestById = async (requestId, options = {}) => {
    return await db.FriendRequest.findOne({ where: { id: requestId }, ...options });
};

// 신청 상태 바꾸고 응답 시각 남기기 (수락·거절)
exports.updateFriendRequestStatus = async (requestId, status, options = {}) => {
    return await db.FriendRequest.update(
        { status, responded_at: new Date() },
        { where: { id: requestId }, ...options }
    );
};

// 닉네임 검색, 나·친구·내가 보낸 대기 신청·차단 관계 뺀 활성 계정 10명
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

    const blockedUuids = await blockRepository.findBlockedCounterpartUuids(myUuid);

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

// 두 사람 사이 대기 신청 전부 취소 (차단할 때, 지우지 않고 이력으로 남김)
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

// 내가 낀 신청들 지금 상태 (화면이 놓친 결과 다시 받기, 남의 신청은 안 보임)
exports.findRequestResults = async (uuid, requestIds, options = {}) => {
    return await db.FriendRequest.findAll({
        where: {
            id: { [Op.in]: requestIds },
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
        },
        attributes: ['id', 'requester_id', 'receiver_id', 'status', 'responded_at'],
        ...options,
    });
};
