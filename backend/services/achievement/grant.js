'use strict';

// 업적 지급 파일, 지급 기록·보상·알림 한 트랜잭션 + 지급 통지
// evaluate.js가 기준 넘은 업적마다 부름, testing.js가 시험에 내보냄
const { getDeps } = require('./deps');
const grantRepository = require('../../repositories/achievement');
const { withTransaction } = require('../../repositories/common');

// 업적 받음 통지, 실패해도 안 던짐 (사건 이름은 프론트 시험이 읽게 글자 그대로)
const notifyGranted = (userId, definition) => {
    try {
        // 전송 창구 없으면 통지만 건너뜀
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;
        // 효과음 사건 id는 알림 출처 키와 같은 모양 (같은 업적 소리 두 번 막기)
        emit(userId, 'achievement_granted', {
            achievementId: definition.id,
            sfxEvent: {
                kind: 'achievement-granted',
                eventId: `achievement:${definition.id}:granted`,
                accountId: userId,
                origin: 'live',
            },
        });
    } catch {
        // 통지 실패가 지급 결과를 깨지 않게 기록만
        console.error('[업적 지급 통지 실패]', { code: 'ACHIEVEMENT_NOTIFY_ERROR', userId, achievementId: definition.id });
    }
};

// 이미 받은 업적이면 granted false (유일 제약으로 두 번 지급 막기)
const grantAchievement = async (userId, definition) => {
    const { db, economyService } = getDeps();
    // 지급 기록·보상·알림 한 트랜잭션 (하나라도 실패하면 전부 되돌림)
    return withTransaction(db, async (transaction) => {
        // 지급 행 먼저, 동시 평가로 유일 제약 걸리면 이미 받은 것으로 봄
        let created;
        try {
            const result = await grantRepository.findOrCreateGrant(db, { userId, achievementId: definition.id }, transaction);
            created = result[1];
        } catch (error) {
            const isDuplicateGrant = grantRepository.isDuplicateGrantError(error, db, userId, definition.id);
            if (!isDuplicateGrant) throw error;
            created = false;
        }

        // 이미 받은 업적이면 보상 안 줌
        if (!created) return { granted: false };

        // 여기부터 진짜 바뀜: 재화·아이템 보상 (참조 id로 같은 보상 두 번 안 쌓임)
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

        // 알림 행도 같은 트랜잭션, 방송은 커밋 뒤 evaluate.js 몫
        const { notification } = await getDeps().notificationService.createForAchievement({
            userId, achievementId: definition.id,
        }, { db, transaction });

        return { granted: true, notification };
    });
};

module.exports = {
    notifyGranted,
    grantAchievement,
};
