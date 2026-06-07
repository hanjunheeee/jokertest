const db = require("../models");
const { Op } = db.Sequelize;

/**
 * 내 친구 관계 전체 조회 (레포지토리)
 * 내가 요청했거나(requester) 요청받은(receiver) 관계 중, 상태가 'ACCEPTED'(수락)인 모든 친구 데이터를 조회합니다.
 * 조인(Join)을 통해 친구의 기본 정보(UUID, 닉네임, 프로필 이미지)도 함께 가져옵니다.
 *
 * @param {String} uuid - 조회할 기준 유저의 UUID
 * @returns {Promise<Array>} 친구 관계(Friendship) 모델 객체들이 담긴 배열
 */
exports.findFriendship = async (uuid) => {
    // 수정 완료: db.findFriendship -> db.Friendship
    return await db.Friendship.findAll({
        where: {
            // 내가 요청했거나 OR 내가 받았거나
            [Op.or]: [{ requester_id: uuid }, { receiver_id: uuid }],
            status: 'ACCEPTED' // 수락된 진짜 친구만
        },
        include: [
            // 양방향 관계를 모두 긁어오기 위해 Friend1(요청자), Friend2(수락자) 둘 다 조인
            { model: db.User, as: 'Friend1', attributes: ['uuid', 'nickname', 'profile_image_url'] },
            { model: db.User, as: 'Friend2', attributes: ['uuid', 'nickname', 'profile_image_url'] }
        ]
    });
}

/**
 * 특정 유저의 현재 접속 상태 조회 (레포지토리)
 * 특정 친구(유저)가 지금 온라인인지, 오프라인인지, 혹은 게임 중인지 확인합니다.
 *
 * @param {String} userId - 접속 상태를 조회할 대상 유저의 UUID
 * @returns {Promise<Object|null>} 접속 상태(OnlinePresence) 모델 객체 (없으면 null)
 */
exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({
        where: { user_id: userId }
    });
}