// 프로필 저장소 파일, 내 프로필 행 + 통계 기본값 채우기
// user/index.js가 묶어 내보냄, 사용자 서비스(services/user.js)의 내 프로필 읽기가 씀
const db              = require("../../models");
const { STATS_DEFAULTS } = require('./constants');

// 통계 행을 plain으로, 행이 없거나 칸이 비면 기본값 (화면이 빈 값을 안 받게)
const toPlainStats = (stats) => {
    if (!stats) return { ...STATS_DEFAULTS };

    const plain  = typeof stats.get === "function" ? stats.get({ plain: true }) : stats;
    const merged = { ...STATS_DEFAULTS };

    for (const key of Object.keys(STATS_DEFAULTS)) {
        if (plain[key] !== undefined && plain[key] !== null) merged[key] = plain[key];
    }
    return merged;
};

// 계정 닉네임·사진 + 통계 행 같이 (계정 없으면 null)
exports.getMyProfile = async (uuid) => {
    const row = await db.User.findOne({
        where: { uuid },
        attributes: ['nickname', 'profile_image_url'],
        include: [{
            model:      db.UserStats,
            attributes: ['title', 'total_games', 'survival_count', 'execution_count', 'most_played_role'],
        }],
    });

    if (!row) return null;

    // hasOne 관계 이름이 UserStat로 붙음 (복수형 이름도 같이 받음)
    return {
        nickname:          row.nickname,
        profile_image_url: row.profile_image_url ?? null,
        UserStat:          toPlainStats(row.UserStat ?? row.UserStats ?? null),
    };
};
