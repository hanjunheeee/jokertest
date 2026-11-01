// 로그인 보호 저장소 파일, 로그인 기록 남기기 · 지금 정지 중인지
// 로그인 서비스가 부름
const db              = require("../../models");
const { Op }          = db.Sequelize;

// 성공·실패 로그인 기록 한 줄
exports.createLoginHistory = async (historyData, options = {}) => {
    return await db.LoginHistory.create(historyData, options);
};

// 아직 안 끝난 정지 하나 (없으면 null)
exports.checkActiveBan = async (user_id) => {
    return await db.UserBan.findOne({
        where: {
            user_id,
            [Op.or]: [
                { is_permanent: true },
                { end_at: { [Op.gt]: new Date() } },
            ],
        },
    });
};
