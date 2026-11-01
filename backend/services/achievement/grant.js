'use strict';

// 업적 지급 파일, 지급 기록·보상·알림 한 트랜잭션 + 지급 통지
// 평가가 기준 넘은 업적마다 부름
const { getDeps } = require('./deps');
const grantRepository = require('../../repositories/achievement');
const { withTransaction } = require('../../repositories/common');

// 지급 통지 실패해도 던지지 않음, 사건 이름은 문자열 그대로
const notifyAchievementGranted = (userId, definition) => {
    try {
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;
        emit(userId, 'achievement_granted', {
            achievementId: definition.id,
            sfxEvent: {
                kind: 'achievement-granted',
                eventId: `achievement:${definition.id}:granted`,
                accountId: userId,
                origin: 'live',
            },
        });
    } catch (error) {
        console.error('[업적 지급 통지 실패]', { code: 'ACHIEVEMENT_NOTIFY_ERROR', userId, achievementId: definition.id });
    }
};

// 이미 받은 업적이면 granted false (유일 제약으로 두 번 지급 막기)
const grantAchievement = async (userId, definition) => {
    const { db, economyService } = getDeps();
    return withTransaction(db, async (transaction) => {
        let created;
        try {
            const result = await grantRepository.findOrCreateGrant(db, { userId, achievementId: definition.id }, transaction);
            created = result[1];
        } catch (error) {
            const isDuplicateGrant = grantRepository.isDuplicateGrantError(error, db, userId, definition.id);
            if (!isDuplicateGrant) throw error;
            created = false;
        }

        if (!created) return { granted: false };

        for (const reward of definition.rewards) {
            if (reward.type === 'CURRENCY') {
                await economyService.grantAchievementCurrency({
                    userId,
                    currency: reward.currency,
                    amount: reward.amount,
                    referenceEventId: `achievement:${definition.id}:${reward.currency}`,
                }, db, { transaction });
            } else if (reward.type === 'ITEM') {
                await economyService.grantAchievementItem({
                    userId,
                    itemId: reward.itemId,
                    itemType: reward.itemType,
                    referenceEventId: `achievement:${definition.id}:ITEM`,
                }, db, { transaction });
            }
        }

        const { notification } = await getDeps().notificationService.createAchievementNotification({
            userId, achievementId: definition.id,
        }, { db, transaction });

        return { granted: true, notification };
    });
};

module.exports = {
    notifyAchievementGranted,
    grantAchievement,
};
