'use strict';

// 업적 컨트롤러 파일, 내 업적 진행·달성 상태 응답
// routes/user.routes.js가 GET /user/me/achievements에 부름 (업적 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const achievementService = require('../services/achievement');

// 로그인 uuid로 진행 값·달성 기록 합친 상태 읽어 응답
exports.getMyAchievements = async (req, res, next) => {
    try {
        const achievements = await achievementService.getStatusForUser(req.user.uuid);
        res.status(200).json({ success: true, data: achievements });
    } catch (error) {
        next(error);
    }
};
