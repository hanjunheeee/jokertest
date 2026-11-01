const gameResultRepository = require("../repositories/gameResult.repositories");
const roleStatisticsPolicy = require("../services/game/roleStatistics");

exports.getMyRoleStatistics = async (req, res, next) => {
    try {
        const stats = await gameResultRepository.getMyRoleStatistics(req.user.uuid);
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

exports.getRoleRanking = async (req, res, next) => {
    try {
        const { role } = req.query;
        if (!roleStatisticsPolicy.ROLE_CODES.includes(role)) {
            return res.status(400).json({ success: false, message: "알 수 없는 직업입니다." });
        }

        const ranking = await gameResultRepository.getRoleRanking(role);
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
