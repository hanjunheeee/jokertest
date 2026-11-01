'use strict';

// 업적 카테고리 입구, 옛 achievementService 이름 + 업적 정의 + 전체 다시 평가 모아서 내보냄
// 컨트롤러·판 업적 손잡이·시험이 이 입구로 부름 (recovery 시험 손잡이는 ./recovery 입구에서만)
const { loadProgress } = require('./progress');
const { getStatusForUser, evaluateAndGrantForUser } = require('./evaluate');
const { __internal } = require('./testing');
// 업적 정의 이름은 하나씩 적음, 전체 다시 평가는 함수 하나만 (recovery __internal은 겹쳐서 뺌)
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
