// 직업 통계 컨트롤러 파일, 내 직업별 전적 · 직업별 순위 응답
// routes/user.routes.js가 부름 (집계는 services/game/roleStatistics, 한글 직업 이름도 거기서)
const roleStatisticsQueries = require("../../services/game/roleStatistics/queries");
const roleStatisticsPolicy = require("../../services/game/roleStatistics");

// 내 직업별 판 수·승·생존·승률에 한글 직업 이름 붙임
exports.getMyRoleStatistics = async (req, res, next) => {
    try {
        const stats = await roleStatisticsQueries.getMyRoleStatistics(req.user.uuid);
        res.status(200).json({
            success: true,
            data: stats.map((entry) => ({
                role: entry.role,
                roleName: roleStatisticsPolicy.getRoleKoreanName(entry.role),
                games: entry.games,
                wins: entry.wins,
                survivalCount: entry.survivalCount,
                winRate: entry.winRate,
            })),
        });
    } catch (error) {
        next(error);
    }
};

// 직업 하나 순위 (모르는 직업 코드는 DB 읽기 전 400)
exports.getRoleRanking = async (req, res, next) => {
    try {
        const { role } = req.query;
        if (!roleStatisticsPolicy.ROLE_CODES.includes(role)) {
            return res.status(400).json({ success: false, message: "알 수 없는 직업입니다." });
        }

        const ranking = await roleStatisticsQueries.getRoleRanking(role);
        res.status(200).json({
            success: true,
            data: {
                role,
                roleName: roleStatisticsPolicy.getRoleKoreanName(role),
                ranking,
            },
        });
    } catch (error) {
        next(error);
    }
};
