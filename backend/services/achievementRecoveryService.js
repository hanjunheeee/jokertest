'use strict';

const achievementService = require('./achievementService');

// achievementService.js와 같은 지연 require 패턴 — overrides.db가 있으면 '../models'를
// 아예 require하지 않는다(단락 평가를 지키기 위해 스프레드하지 않는다).
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get achievementService() { return overrides.achievementService ?? achievementService; },
});

let deps = buildDeps();

// F-12(A-07): 새 경기·투표·페이지 방문 없이도 과거·신규 지급 누락을 재처리하는 명시적
// 경로. 매번 "지금 존재하는 모든 계정"을 다시 순회한다 — 완료 표시를 별도로 남기지 않으므로
// 이전 실행이 중간에 실패해도(어떤 계정에서 예외가 나도) 다음 실행이 모든 계정을 다시
// 포함한다. 중복 지급이 없는 이유는 achievementService.evaluateAndGrantForUser가
// achievement_grants의 (user_id, achievement_id) 유일 제약을 게이트로 쓰기 때문이다(AC-04)
// — 이 서비스는 그 위에 "누구를 평가할지"만 결정하고, 한 계정의 실패가 다른 계정 처리를
// 막지 않도록 각각 독립적으로 catch한다(gameSession.js의 evaluateAchievementsForUsers와
// 같은 원칙).
const evaluateAllUsers = async () => {
    const { db, achievementService: service } = deps;
    const users = await db.User.findAll({ attributes: ['uuid'], raw: true });

    const summary = { usersProcessed: 0, grants: [], errors: [] };
    for (const { uuid } of users) {
        try {
            const results = await service.evaluateAndGrantForUser(uuid);
            const grantedIds = results.filter((r) => r.granted).map((r) => r.id);
            if (grantedIds.length > 0) summary.grants.push({ userId: uuid, achievementIds: grantedIds });
            summary.usersProcessed += 1;
        } catch (error) {
            summary.errors.push({ userId: uuid, message: error.message });
        }
    }
    return summary;
};

module.exports = {
    evaluateAllUsers,
    // 테스트 전용 — DB 없이 evaluateAllUsers의 순회·오류 격리·요약 집계를 검증할 때 fake
    // db/achievementService를 주입한다. 런타임 코드에서는 참조하지 않는다.
    __internal: {
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
