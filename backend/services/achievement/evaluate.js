'use strict';

// 업적 평가 파일, 평가 뒤 지급 · 업적 상태 조회
// 판 끝·투표 뒤 손잡이·컨트롤러·전체 다시 평가가 부름
const achievementDefinitions = require('./definitions');
const { loadProgress, currentValueOf, meetsThreshold } = require('./progress');
const { grantAchievement, notifyGranted } = require('./grant');
const { getDeps } = require('./deps');
const grantRepository = require('../../repositories/achievement');

// 정의 순서대로 기준 넘은 것만 지급, 새로 지급되면 통지·알림 보냄
const evaluateAndGrantForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];

    const progress = await loadProgress(userId);
    const results = [];

    for (const definition of achievementDefinitions.ACHIEVEMENT_DEFINITIONS) {
        const current = currentValueOf(definition, progress);
        const achieved = meetsThreshold(definition, progress);
        if (!achieved) {
            results.push({ id: definition.id, achieved: false, granted: false, current, threshold: definition.threshold });
            continue;
        }
        const { granted, notification } = await grantAchievement(userId, definition);
        if (granted) {
            notifyGranted(userId, definition);
            if (notification) getDeps().notificationService.emitNotificationCreated(userId, notification);
        }
        results.push({ id: definition.id, achieved: true, granted, current, threshold: definition.threshold });
    }

    return results;
};

// 진행 값과 지급 기록을 합쳐 화면용 상태
const getStatusForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];

    const { db } = getDeps();
    const [progress, grants] = await Promise.all([
        loadProgress(userId),
        grantRepository.listGrantsByUser(db, userId),
    ]);
    const grantedAtById = new Map(grants.map((grant) => [grant.achievement_id, grant.granted_at]));

    return achievementDefinitions.ACHIEVEMENT_DEFINITIONS.map((definition) => {
        const grantedAt = grantedAtById.get(definition.id) ?? null;
        return {
            id: definition.id,
            achieved: meetsThreshold(definition, progress),
            current: currentValueOf(definition, progress),
            threshold: definition.threshold,
            granted: grantedAt !== null,
            grantedAt,
        };
    });
};

module.exports = {
    evaluateAndGrantForUser,
    getStatusForUser,
};
