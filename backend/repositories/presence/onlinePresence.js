// 접속 상태 저장소 파일, 접속 행 읽기·저장
// 친구 목록·접속 서비스가 모듈 객체로 바로 부름

const db     = require("../../models");
const { Op } = db.Sequelize;

// 여러 계정 접속 행
exports.findOnlinePresences = async (userIds) => {
    return await db.OnlinePresence.findAll({ where: { user_id: { [Op.in]: userIds } } });
};

// 계정 하나 접속 행
exports.findOnlinePresence = async (userId) => {
    return await db.OnlinePresence.findOne({ where: { user_id: userId } });
};

// 접속 상태 저장 (없으면 만들고, 있으면 바꿈), 마지막 활동 시각 지금으로
exports.upsertOnlinePresence = async (userId, status) => {
    return await db.OnlinePresence.upsert({
        user_id:        userId,
        status,
        last_active_at: new Date(),
    });
};
