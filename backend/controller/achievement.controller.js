'use strict';

const achievementService = require('../services/achievementService');

// F-12: 서고 "금지된 기록"·"초대받은 자들"이 읽는 22개 업적 진행률·달성 상태. 본인
// 계정(req.user.uuid)만 조회한다 — roleStatistics.controller.js의 getMyRoleStatistics와
// 같은 인증 경계 원칙이다(A-09, 다른 계정의 업적을 body/query로 조회할 길을 열지 않는다).
// getStatusForUser는 읽기 전용이라(A-09) 이 GET을 반복 호출해도 보상이 지급되지 않는다.
exports.getMyAchievements = async (req, res, next) => {
    try {
        const achievements = await achievementService.getStatusForUser(req.user.uuid);
        res.status(200).json({ success: true, data: achievements });
    } catch (error) {
        next(error);
    }
};
