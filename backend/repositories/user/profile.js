// 프로필 저장소 파일, 내 프로필 행 + 통계 기본값 채우기
// 프로필 컨트롤러·서비스가 부름
const db              = require("../../models");
const { STATS_DEFAULTS } = require('./constants');

// 통계 행을 plain으로, 없으면 기본값
const toPlainStats = (stats) => {
    if (!stats) return { ...STATS_DEFAULTS };

    const plain  = typeof stats.get === "function" ? stats.get({ plain: true }) : stats;
    const merged = { ...STATS_DEFAULTS };

    for (const key of Object.keys(STATS_DEFAULTS)) {
        if (plain[key] !== undefined && plain[key] !== null) merged[key] = plain[key];
    }
    return merged;
};

// 계정 + 통계 행 같이
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

    return {
        nickname:          row.nickname,
        profile_image_url: row.profile_image_url ?? null,
        UserStat:          toPlainStats(row.UserStat ?? row.UserStats ?? null),
    };
};
