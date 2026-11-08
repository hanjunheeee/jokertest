// 로그인 보호 저장소 파일, 로그인 기록 남기기 · 지금 정지 중인지
// user/index.js가 묶어 내보냄, 로그인·refresh·세션 확인(sessionLifecycle) 서비스가 씀
const db              = require("../../models");
const { Op }          = db.Sequelize;

// 성공·실패 로그인 기록 한 줄
exports.createLoginHistory = async (historyData, options = {}) => {
    return await db.LoginHistory.create(historyData, options);
};

// 지금 걸린 정지 하나: 시작 시각이 없거나 지났고, 영구거나 끝나는 시각이 안 지났으면 정지 중 (없으면 null)
// 시작 전 예약 정지는 아직 안 걸림
exports.checkActiveBan = async (user_id) => {
    const now = new Date();
    return await db.UserBan.findOne({
        where: {
            user_id,
            [Op.and]: [
                { [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }] },
                { [Op.or]: [{ is_permanent: true }, { end_at: { [Op.gt]: now } }] },
            ],
        },
    });
};
