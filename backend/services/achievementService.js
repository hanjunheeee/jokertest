'use strict';

const achievementDefinitions = require('./achievementDefinitions');

const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get gameResultRepository() { return overrides.gameResultRepository ?? require('../repositories/gameResult.repositories'); },
    get voteParticipationRepository() { return overrides.voteParticipationRepository ?? require('../repositories/voteParticipation.repositories'); },
    get economyService() { return overrides.economyService ?? require('./economy'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get notificationService() { return overrides.notificationService ?? require('./notification'); },
});

let deps = buildDeps();

const METRICS = achievementDefinitions.METRICS;

const currentValueOf = (definition, progress) => {
    switch (definition.metric) {
        case METRICS.COMPLETED_GAMES: return progress.completedGames;
        case METRICS.VOTE_PARTICIPATIONS: return progress.voteParticipations;
        case METRICS.SURVIVALS: return progress.survivals;
        case METRICS.WINS: return progress.wins;
        case METRICS.ROLE_WINS: return progress.roleWinsByRole.get(definition.role) ?? 0;
        default: return 0;
    }
};

const meetsThreshold = (definition, progress) => currentValueOf(definition, progress) >= definition.threshold;

const notifyAchievementGranted = (userId, definition) => {
    try {
        const emit = deps.emitToUser;
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

const loadProgress = async (userId) => {
    const [gameStats, voteParticipations] = await Promise.all([
        deps.gameResultRepository.getAchievementProgressStats(userId),
        deps.voteParticipationRepository.countEligibleDayVoteParticipations(userId),
    ]);
    return { ...gameStats, voteParticipations };
};

const grantAchievement = async (userId, definition) => {
    const { db, economyService } = deps;
    return db.sequelize.transaction(async (transaction) => {
        let created;
        try {
            const result = await db.AchievementGrant.findOrCreate({
                where: { user_id: userId, achievement_id: definition.id },
                defaults: { user_id: userId, achievement_id: definition.id, granted_at: new Date() },
                transaction,
            });
            created = result[1];
        } catch (error) {
            const constraint = error?.parent?.constraint ?? error?.original?.constraint;
            const isDuplicateGrant = error instanceof db.Sequelize.UniqueConstraintError && (
                constraint === 'achievement_grants_user_achievement_unique' ||
                Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'achievement_grants_user_achievement_unique') ||
                (error?.fields?.user_id === userId && error?.fields?.achievement_id === definition.id)
            );
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

        const { notification } = await deps.notificationService.createAchievementNotification({
            userId, achievementId: definition.id,
        }, { db, transaction });

        return { granted: true, notification };
    });
};

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
            notifyAchievementGranted(userId, definition);
            if (notification) deps.notificationService.emitNotificationCreated(userId, notification);
        }
        results.push({ id: definition.id, achieved: true, granted, current, threshold: definition.threshold });
    }

    return results;
};

const getStatusForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];

    const { db } = deps;
    const [progress, grants] = await Promise.all([
        loadProgress(userId),
        db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id', 'granted_at'], raw: true }),
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
    loadProgress,
    getStatusForUser,
    evaluateAndGrantForUser,
    __internal: {
        meetsThreshold,
        currentValueOf,
        grantAchievement,
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
