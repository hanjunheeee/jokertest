'use strict';

// F-12 업적 정의의 유일한 소스. 프론트 22개 정의(frontend/src/domains/library/content/
// forbiddenRecords/spreadMeta.js의 FORBIDDEN_RECORDS_SPREAD_META 7개 +
// frontend/src/domains/library/content/invitedGuests/jobChallenges.js의
// INVITED_GUESTS_JOB_CHALLENGES 5직업 × 3단계)의 id·개수·순서를 그대로 옮기고, 프론트에는
// 없던 서버 판정 조건(metric·threshold)과 정확한 보상량을 덧붙인다(AC-01/AC-02/A-01/A-02).
// 프론트 두 파일은 이 슬라이스에서 고치지 않는다 — 표시 문구·순서는 프론트가 계속 소유하고,
// 이 파일은 같은 id로 서버 진행률/달성을 잇는 역할만 한다.
//
// metric 종류(achievementService.js가 gameResult.repositories.getAchievementProgressStats와
// voteParticipation.repositories.countEligibleDayVoteParticipations의 결과에서 각각 읽는다):
//   - COMPLETED_GAMES: 정상 확정(비개발) 경기 참가 횟수.
//   - VOTE_PARTICIPATIONS: 일반 낮 투표 유효 참여 횟수(F-11).
//   - SURVIVALS: 정상 확정 경기에서 종료 시까지 생존한 횟수.
//   - WINS: 정상 확정 경기에서 승리한 횟수(직업 무관).
//   - ROLE_WINS: 정상 확정 경기에서 특정 role로 승리한 횟수(직업 도전과제 전용).
//
// 보상(A-02): 기록 7종은 전부 골드 50 + 다이아 50(FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS와
// 동일한 수량). 직업 도전과제는 10승 골드10·다이아10, 20승 골드20·다이아30, 30승은 해당
// 직업 프로필 테두리(재화 없음) — INVITED_GUESTS_JOB_CHALLENGES의 rewards와 동일한 수량.
// 아이콘 파일명의 숫자(gold50.png 등)는 표시용 자산 이름일 뿐 수량 계산에 쓰지 않는다.

const CURRENCIES = Object.freeze({ GOLD: 'GOLD', DIAMOND: 'DIAMOND' });

const METRICS = Object.freeze({
    COMPLETED_GAMES: 'COMPLETED_GAMES',
    VOTE_PARTICIPATIONS: 'VOTE_PARTICIPATIONS',
    SURVIVALS: 'SURVIVALS',
    WINS: 'WINS',
    ROLE_WINS: 'ROLE_WINS',
});

// 프론트 job 키(jobChallenges.js) → 프론트 id 접두사(achievement id는 이 접두사를 그대로
// 쓴다 — witchHunter만 id가 "witch-hunter-win-*"로 카멜케이스가 아니라 케밥케이스임에
// 주의) · 서버 GAME_ROLES 코드(game-core/gameSession.js) · 보상 테두리
// itemId(backend/economy/catalog.js의 JOB_PROFILE_BORDER_NAMES)로 쓰는 한글 이름.
// roleStatisticsPolicy.ROLE_KOREAN_NAMES와 동일한 role↔한글 매핑이다.
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

// AC-01: spreadMeta.js의 FORBIDDEN_RECORDS_SPREAD_META와 같은 순서·id 7개.
const FORBIDDEN_RECORD_ACHIEVEMENTS = Object.freeze([
    { id: 'record-1-masquerade', metric: METRICS.COMPLETED_GAMES, threshold: 3, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-2-extra-mask', metric: METRICS.VOTE_PARTICIPATIONS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-3-first-morning', metric: METRICS.SURVIVALS, threshold: 5, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-4-testimonies', metric: METRICS.COMPLETED_GAMES, threshold: 15, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-5-clown-story', metric: METRICS.WINS, threshold: 10, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-6-dead-mans-leaving', metric: METRICS.SURVIVALS, threshold: 20, rewards: FORBIDDEN_RECORD_REWARDS },
    { id: 'record-7-erased-night', metric: METRICS.WINS, threshold: 30, rewards: FORBIDDEN_RECORD_REWARDS },
]);

// AC-01: jobChallenges.js의 INVITED_GUESTS_JOB_CHALLENGES와 같은 순서(noble/clown/doctor/
// guard/witchHunter × win-10/20/30) 15개.
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

// AC-01: 합계 22개(기록 7 + 직업 15), 프론트 정의 순서 그대로(기록 먼저, 그다음 직업).
const ACHIEVEMENT_DEFINITIONS = Object.freeze([...FORBIDDEN_RECORD_ACHIEVEMENTS, ...JOB_ACHIEVEMENTS]);

const ACHIEVEMENT_DEFINITIONS_BY_ID = new Map(ACHIEVEMENT_DEFINITIONS.map((def) => [def.id, def]));

const getAchievementDefinition = (achievementId) => ACHIEVEMENT_DEFINITIONS_BY_ID.get(achievementId);

module.exports = {
    CURRENCIES,
    METRICS,
    JOB_ROLES,
    FORBIDDEN_RECORD_ACHIEVEMENTS,
    JOB_ACHIEVEMENTS,
    ACHIEVEMENT_DEFINITIONS,
    getAchievementDefinition,
};
