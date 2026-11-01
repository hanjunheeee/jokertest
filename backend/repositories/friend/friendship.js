// 친구 관계 저장소 파일, 친구 관계 찾기·만들기 + 친구·초대 쓰기 트랜잭션 앞 계정 잠금
// 친구·게임 초대·접속 서비스가 모듈 객체로 부름 (시험이 이 객체 이름을 갈아끼움)

const db     = require("../../models");
const { Op } = db.Sequelize;

// 수락된 친구 관계 + 양쪽 계정 프로필
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

// 수락된 친구 관계 uuid 두 칸만 (접속 상태 알릴 친구 고르기용)
exports.findFriendshipUuidsOnly = async (uuid) => {
    return await db.Friendship.findAll({
        where: {
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED',
        },
        attributes: ['requester_id', 'receiver_id'],
    });
};

// 수락 상태 친구 관계 한 줄 만들기
exports.createFriendship = async (requesterId, receiverId, options = {}) => {
    return await db.Friendship.create({
        requester_id: requesterId,
        receiver_id:  receiverId,
        status:       'ACCEPTED',
    }, options);
};

// 두 사람 사이 친구 관계 하나 (방향 무관)
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

// 계정 행을 uuid 정렬 순서로 잠금 (동시 트랜잭션끼리 교착 막기)
// 전역 db 씀: 게임 초대는 주입 db로 트랜잭션 열고 잠금만 여기서 → 이 모양 유지해야 동작 그대로
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
