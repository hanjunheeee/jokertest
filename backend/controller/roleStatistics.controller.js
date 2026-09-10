const gameResultRepository = require("../repositories/gameResult.repositories");
const roleStatisticsPolicy = require("../services/roleStatisticsPolicy");

// F-10: 직업 전적·랭킹. 내 전적은 req.user.uuid(토큰 소유자)에서만 계정을 가져온다 —
// 요청 body/query의 임의 user_id로 다른 계정의 전적을 조회할 길을 열지 않는다(A-09).
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

// AC-03: role은 반드시 고정 5개 코드 중 하나여야 한다 — 검증 없이 쿼리에 그대로 실어 보내지 않는다.
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
