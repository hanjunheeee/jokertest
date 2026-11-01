'use strict';

// 업적 정의 파일, 보상 재화·지표·직업 묶음 + 업적 22개 목록 · id로 찾기
// evaluate.js·progress.js·업적 입구(index.js)·시험이 씀

// 보상 재화 이름, 경제 서비스 재화 코드와 같은 글자
const CURRENCIES = Object.freeze({ GOLD: 'GOLD', DIAMOND: 'DIAMOND' });

// 업적이 세는 지표 (progress.js가 지표마다 지금 값 꺼냄)
const METRICS = Object.freeze({
    COMPLETED_GAMES: 'COMPLETED_GAMES',
    VOTE_PARTICIPATIONS: 'VOTE_PARTICIPATIONS',
    SURVIVALS: 'SURVIVALS',
    WINS: 'WINS',
    ROLE_WINS: 'ROLE_WINS',
});

// 직업 업적 5종, 한글 이름은 상점 테두리 id(profile-border-이름)에 맞춤
const JOB_ROLES = Object.freeze({
    noble: { idPrefix: 'noble', role: 'CITIZEN', koreanName: '귀족' },
    clown: { idPrefix: 'clown', role: 'JOKER', koreanName: '광대' },
    doctor: { idPrefix: 'doctor', role: 'DOCTOR', koreanName: '주치의' },
    guard: { idPrefix: 'guard', role: 'GUARD', koreanName: '경비원' },
    witchHunter: { idPrefix: 'witch-hunter', role: 'WITCH_HUNTER', koreanName: '마녀사냥꾼' },
});

// 금지된 기록 업적 7개가 같이 쓰는 보상
const FORBIDDEN_RECORD_REWARDS = Object.freeze([
    { type: 'CURRENCY', currency: CURRENCIES.GOLD, amount: 50 },
    { type: 'CURRENCY', currency: CURRENCIES.DIAMOND, amount: 50 },
]);

// 금지된 기록 업적 7개 (판 수·투표 참여·생존·승리 기준)
const FORBIDDEN_RECORD_ACHIEVEMENTS = Object.freeze([
    { id: 'record-1-masquerade', metric: METRICS.COMPLETED_GAMES, threshold: 3, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-2-extra-mask', metric: METRICS.VOTE_PARTICIPATIONS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-3-first-morning', metric: METRICS.SURVIVALS, threshold: 5, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-4-testimonies', metric: METRICS.COMPLETED_GAMES, threshold: 15, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-5-clown-story', metric: METRICS.WINS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-6-dead-mans-leaving', metric: METRICS.SURVIVALS, threshold: 20, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-7-erased-night', metric: METRICS.WINS, threshold: 30, rewards: FORBIDDEN_RECORD_REWARDS },
]);

// 직업마다 10·20·30승 업적 3개, 30승 보상은 그 직업 테두리
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

// 전체 목록: 기록 7개 뒤에 직업 15개 (이 순서로 평가·상태 목록 나감, 시험이 순서 잠금)
const ACHIEVEMENT_DEFINITIONS = Object.freeze([...FORBIDDEN_RECORD_ACHIEVEMENTS, ...JOB_ACHIEVEMENTS]);

const DEFINITIONS_BY_ID = new Map(ACHIEVEMENT_DEFINITIONS.map((def) => [def.id, def]));

// 업적 id로 정의 찾기, 없는 id면 undefined (지금은 시험만 씀)
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
