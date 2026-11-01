'use strict';

// 업적 평가 파일, 기준 넘은 업적 지급 · 화면용 업적 상태
// 업적 입구(index.js) 거쳐 컨트롤러·services/game/achievementHooks.js가, recovery.js는 바로 부름
const achievementDefinitions = require('./definitions');
const { loadProgress, currentValueOf, meetsThreshold } = require('./progress');
const { grantAchievement, notifyGranted } = require('./grant');
const { getDeps } = require('./deps');
const grantRepository = require('../../repositories/achievement');

// 정의 순서대로 기준 넘은 것만 지급, 새로 지급되면 통지·알림 보냄
const evaluateAndGrantForUser = async (userId) => {
    // 계정 id 없으면 DB 안 읽고 빈 결과
    if (typeof userId !== 'string' || userId.length === 0) return [];

    // 진행 값은 한 번만 읽고 업적 전부에 같이 씀
    const progress = await loadProgress(userId);
    const results = [];

    for (const definition of achievementDefinitions.ACHIEVEMENT_DEFINITIONS) {
        const current = currentValueOf(definition, progress);
        const achieved = meetsThreshold(definition, progress);
        // 기준 못 넘으면 지급 없이 진행 값만 남김
        if (!achieved) {
            results.push({ id: definition.id, achieved: false, granted: false, current, threshold: definition.threshold });
            continue;
        }
        const { granted, notification } = await grantAchievement(userId, definition);
        // 새로 받은 것만 통지·알림, 트랜잭션 끝난 뒤라 커밋 전 알림 없음
        if (granted) {
            notifyGranted(userId, definition);
            if (notification) getDeps().notificationService.emitNotificationCreated(userId, notification);
        }
        results.push({ id: definition.id, achieved: true, granted, current, threshold: definition.threshold });
    }

    return results;
};

// 진행 값과 지급 기록을 합쳐 화면용 상태 (업적 목록 화면)
const getStatusForUser = async (userId) => {
    // 계정 id 없으면 빈 목록
    if (typeof userId !== 'string' || userId.length === 0) return [];

    // 진행 값·지급 기록은 서로 안 기다리고 같이 읽음
    const { db } = getDeps();
    const [progress, grants] = await Promise.all([
        loadProgress(userId),
        grantRepository.listGrantsByUser(db, userId),
    ]);
    const grantedAtById = new Map(grants.map((grant) => [grant.achievement_id, grant.granted_at]));

    // 지급 기록 있으면 받은 것, 없으면 받은 시각 null
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
