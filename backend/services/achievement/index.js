'use strict';

// 업적 입구, 평가·상태·진행 읽기·시험 손잡이 + 업적 정의 + 전체 다시 평가 모아 내보냄
// controllers/achievement.controller.js·services/game/achievementHooks.js·시험이 부름 (recovery 시험 손잡이는 recovery.js에서만)
const { loadProgress } = require('./progress');
const { getStatusForUser, evaluateAndGrantForUser } = require('./evaluate');
const { __internal } = require('./testing');
// 업적 정의 이름은 하나씩 꺼냄, 전체 다시 평가는 함수 하나만 (recovery __internal은 이름 겹쳐서 뺌)
const {
    CURRENCIES,
    METRICS,
    JOB_ROLES,
    FORBIDDEN_RECORD_ACHIEVEMENTS,
    JOB_ACHIEVEMENTS,
    ACHIEVEMENT_DEFINITIONS,
    getAchievementDefinition,
} = require('./definitions');
const { evaluateAllUsers } = require('./recovery');

module.exports = {
    loadProgress,
    getStatusForUser,
    evaluateAndGrantForUser,
    __internal,
    CURRENCIES,
    METRICS,
    JOB_ROLES,
    FORBIDDEN_RECORD_ACHIEVEMENTS,
    JOB_ACHIEVEMENTS,
    ACHIEVEMENT_DEFINITIONS,
    getAchievementDefinition,
    evaluateAllUsers,
};
