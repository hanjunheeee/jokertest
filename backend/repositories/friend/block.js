// 차단·즐겨찾기 저장소 파일, 차단 찾기·만들기·지우기 + 즐겨찾기 읽기·켜고 끄기 (내가 남에게 다는 한쪽 표시 둘)
// 친구·게임 초대 서비스와 신청 검색(request.js)이 모듈 객체로 부름 (시험이 함수를 바꿔 끼움)

const db     = require("../../models");
const { Op } = db.Sequelize;

// 내 즐겨찾기 친구 id 목록 (친구 목록에 즐겨찾기 표시)
exports.findFavoriteFriendIds = async (ownerId, options = {}) => {
    const rows = await db.FriendFavorite.findAll({
        where: { owner_id: ownerId },
        attributes: ['friend_id'],
        ...options,
    });
    return rows.map((row) => row.friend_id);
};

// 즐겨찾기 켜기·끄기 → 바뀐 뒤 값 (같은 값 두 번 눌러도 결과 그대로)
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

// 내가 차단한 행 + 상대 프로필, 최근 차단 먼저 (차단 목록 화면)
exports.findBlocksOwnedBy = async (ownerId, options = {}) => {
    return await db.FriendBlock.findAll({
        where: { owner_id: ownerId },
        include: [{ model: db.User, as: 'BlockedUser', attributes: ['uuid', 'nickname', 'profile_image_url'] }],
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        ...options,
    });
};

// 두 사람 사이 차단 행, 누가 했든 (신청·초대 막기용)
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

// 나와 차단 관계인 상대 uuid, 내가 했든 당했든 겹침 없이 (친구 목록·검색에서 빼기)
exports.findBlockedCounterpartUuids = async (uuid, options = {}) => {
    const rows = await db.FriendBlock.findAll({
        where: { [Op.or]: [{ owner_id: uuid }, { blocked_id: uuid }] },
        attributes: ['owner_id', 'blocked_id'],
        ...options,
    });
    return [...new Set(rows.map((row) => (row.owner_id === uuid ? row.blocked_id : row.owner_id)))];
};

// 차단 한 줄 만들기 (이미 있으면 그 행, 두 번 눌러도 한 줄)
exports.createBlock = async (ownerId, blockedId, options = {}) => {
    const [row] = await db.FriendBlock.findOrCreate({
        where: { owner_id: ownerId, blocked_id: blockedId },
        defaults: { owner_id: ownerId, blocked_id: blockedId, created_at: new Date() },
        ...options,
    });
    return row;
};

// 내가 단 차단 행만 지우기 → 지운 수 (상대가 단 차단은 안 건드림)
exports.deleteBlock = async (ownerId, blockedId, options = {}) => {
    return await db.FriendBlock.destroy({
        where: { owner_id: ownerId, blocked_id: blockedId },
        ...options,
    });
};
