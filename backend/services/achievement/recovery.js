'use strict';

// 업적 전체 다시 평가 파일, 모든 계정 돌며 빠진 업적 지급
// scripts/backfill-achievements.js·업적 입구(index.js)·시험이 부름
// 평가 함수는 evaluate.js에서 바로 (입구를 부르면 입구 ↔ recovery 순환)
const achievementService = require('./evaluate');
const userLookup = require('../../repositories/user/lookup');

// 시험 주입 먼저, 없으면 진짜 db·평가 함수
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../repositories/common/db'); },
    get achievementService() { return overrides.achievementService ?? achievementService; },
});

// 지금 쓰는 주입 묶음
let deps = buildDeps();

// 계정마다 평가·지급, 요약(처리 수·새 지급·오류) 돌려줌
const evaluateAllUsers = async () => {
    const { db, achievementService: service } = deps;
    const users = await userLookup.listAllUuids(db);

    const summary = { usersProcessed: 0, grants: [], errors: [] };
    for (const { uuid } of users) {
        try {
            const results = await service.evaluateAndGrantForUser(uuid);
            // 새로 받은 업적 있는 계정만 요약에 남김
            const grantedIds = results.filter((r) => r.granted).map((r) => r.id);
            if (grantedIds.length > 0) summary.grants.push({ userId: uuid, achievementIds: grantedIds });
            summary.usersProcessed += 1;
        } catch (error) {
            // 한 계정 실패가 다음 계정 안 막게 오류로만 남김 (다시 돌리면 그 계정 다시 평가)
            summary.errors.push({ userId: uuid, message: error.message });
        }
    }
    return summary;
};

module.exports = {
    evaluateAllUsers,
    __internal: {
        // 시험용: db·평가 함수 갈아끼우기 (null이면 진짜 것으로)
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
