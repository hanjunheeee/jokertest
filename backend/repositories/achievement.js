'use strict';

// 업적 지급 저장소 파일, 지급 행 한 번만 만들기 · 중복 지급 오류 판정 · 사람별 지급 목록
// 업적 서비스(achievement/grant·evaluate)가 주입 db를 넘겨 부름

// 그 업적 지급 행 없으면 만듦 → [행, 새로 만들었나] (지급 시각은 지금)
const findOrCreateGrant = (db, { userId, achievementId }, transaction) => db.AchievementGrant.findOrCreate({
    where: { user_id: userId, achievement_id: achievementId },
    defaults: { user_id: userId, achievement_id: achievementId, granted_at: new Date() },
    transaction,
});

// 같은 사람·같은 업적 유일 제약에 걸린 건지 (동시 지급 경합이면 이미 받은 걸로 침, 다른 유일 오류는 아님)
const isDuplicateGrantError = (error, db, userId, achievementId) => {
    // 제약 이름·fields 안 이름·두 칸 값 중 하나면 같은 업적 (방언마다 다름)
    const constraint = error?.parent?.constraint ?? error?.original?.constraint;
    return error instanceof db.Sequelize.UniqueConstraintError && (
        constraint === 'achievement_grants_user_achievement_unique' ||
        Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'achievement_grants_user_achievement_unique') ||
        (error?.fields?.user_id === userId && error?.fields?.achievement_id === achievementId)
    );
};

// 그 사람 지급 기록 (업적 id·지급 시각만)
const listGrantsByUser = (db, userId) => db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id', 'granted_at'], raw: true });

module.exports = {
    findOrCreateGrant,
    isDuplicateGrantError,
    listGrantsByUser,
};
