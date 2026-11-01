'use strict';

const CURRENCIES = Object.freeze({ GOLD: 'GOLD', DIAMOND: 'DIAMOND' });

const METRICS = Object.freeze({
    COMPLETED_GAMES: 'COMPLETED_GAMES',
    VOTE_PARTICIPATIONS: 'VOTE_PARTICIPATIONS',
    SURVIVALS: 'SURVIVALS',
    WINS: 'WINS',
    ROLE_WINS: 'ROLE_WINS',
});

const JOB_ROLES = Object.freeze({
    noble: { idPrefix: 'noble', role: 'CITIZEN', koreanName: '귀족' },
    clown: { idPrefix: 'clown', role: 'JOKER', koreanName: '광대' },
    doctor: { idPrefix: 'doctor', role: 'DOCTOR', koreanName: '주치의' },
    guard: { idPrefix: 'guard', role: 'GUARD', koreanName: '경비원' },
    witchHunter: { idPrefix: 'witch-hunter', role: 'WITCH_HUNTER', koreanName: '마녀사냥꾼' },
});

const FORBIDDEN_RECORD_REWARDS = Object.freeze([
    { type: 'CURRENCY', currency: CURRENCIES.GOLD, amount: 50 },
    { type: 'CURRENCY', currency: CURRENCIES.DIAMOND, amount: 50 },
]);

const FORBIDDEN_RECORD_ACHIEVEMENTS = Object.freeze([
    { id: 'record-1-masquerade', metric: METRICS.COMPLETED_GAMES, threshold: 3, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-2-extra-mask', metric: METRICS.VOTE_PARTICIPATIONS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-3-first-morning', metric: METRICS.SURVIVALS, threshold: 5, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-4-testimonies', metric: METRICS.COMPLETED_GAMES, threshold: 15, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-5-clown-story', metric: METRICS.WINS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-6-dead-mans-leaving', metric: METRICS.SURVIVALS, threshold: 20, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-7-erased-night', metric: METRICS.WINS, threshold: 30, rewards: FORBIDDEN_RECORD_REWARDS },
]);

const JOB_ACHIEVEMENTS = Object.freeze(
    Object.values(JOB_ROLES).flatMap(({ idPrefix, role, koreanName }) => [
        {
            id: `${idPrefix}-win-10`,
            metric: METRICS.ROLE_WINS,
            role,
            threshold: 10,
            rewards: [
                { type: 'CURRENCY', currency: CURRENCIES.GOLD, amount: 10 },
                { type: 'CURRENCY', currency: CURRENCIES.DIAMOND, amount: 10 },
            ],
        },
        {
            id: `${idPrefix}-win-20`,
            metric: METRICS.ROLE_WINS,
            role,
            threshold: 20,
            rewards: [
                { type: 'CURRENCY', currency: CURRENCIES.GOLD, amount: 20 },
                { type: 'CURRENCY', currency: CURRENCIES.DIAMOND, amount: 30 },
            ],
        },
        {
            id: `${idPrefix}-win-30`,
            metric: METRICS.ROLE_WINS,
            role,
            threshold: 30,
            rewards: [
                { type: 'ITEM', itemId: `profile-border-${koreanName}`, itemType: 'PROFILE_BORDER' },
            ],
        },
    ]),
);

const ACHIEVEMENT_DEFINITIONS = Object.freeze([...FORBIDDEN_RECORD_ACHIEVEMENTS, ...JOB_ACHIEVEMENTS]);

const DEFINITIONS_BY_ID = new Map(ACHIEVEMENT_DEFINITIONS.map((def) => [def.id, def]));

const getAchievementDefinition = (achievementId) => DEFINITIONS_BY_ID.get(achievementId);

module.exports = {
    CURRENCIES,
    METRICS,
    JOB_ROLES,
    FORBIDDEN_RECORD_ACHIEVEMENTS,
    JOB_ACHIEVEMENTS,
    ACHIEVEMENT_DEFINITIONS,
    getAchievementDefinition,
};
