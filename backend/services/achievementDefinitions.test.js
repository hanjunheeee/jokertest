'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    ACHIEVEMENT_DEFINITIONS,
    FORBIDDEN_RECORD_ACHIEVEMENTS,
    JOB_ACHIEVEMENTS,
    getAchievementDefinition,
} = require('./achievementDefinitions');

const FRONTEND_SPREAD_META_PATH = path.join(__dirname, '..', '..', 'frontend', 'src', 'domains', 'library', 'content', 'forbiddenRecords', 'spreadMeta.js');
const FRONTEND_JOB_CHALLENGES_PATH = path.join(__dirname, '..', '..', 'frontend', 'src', 'domains', 'library', 'content', 'invitedGuests', 'jobChallenges.js');

const EXPECTED_FORBIDDEN_RECORDS = [
    { id: 'record-1-masquerade', metric: 'COMPLETED_GAMES', threshold: 3 },
    { id: 'record-2-extra-mask', metric: 'VOTE_PARTICIPATIONS', threshold: 10 },
    { id: 'record-3-first-morning', metric: 'SURVIVALS', threshold: 5 },
    { id: 'record-4-testimonies', metric: 'COMPLETED_GAMES', threshold: 15 },
    { id: 'record-5-clown-story', metric: 'WINS', threshold: 10 },
    { id: 'record-6-dead-mans-leaving', metric: 'SURVIVALS', threshold: 20 },
    { id: 'record-7-erased-night', metric: 'WINS', threshold: 30 },
];

const EXPECTED_JOB_ACHIEVEMENTS = [
    { id: 'noble-win-10', role: 'CITIZEN', threshold: 10 },
    { id: 'noble-win-20', role: 'CITIZEN', threshold: 20 },
    { id: 'noble-win-30', role: 'CITIZEN', threshold: 30 },
    { id: 'clown-win-10', role: 'JOKER', threshold: 10 },
    { id: 'clown-win-20', role: 'JOKER', threshold: 20 },
    { id: 'clown-win-30', role: 'JOKER', threshold: 30 },
    { id: 'doctor-win-10', role: 'DOCTOR', threshold: 10 },
    { id: 'doctor-win-20', role: 'DOCTOR', threshold: 20 },
    { id: 'doctor-win-30', role: 'DOCTOR', threshold: 30 },
    { id: 'guard-win-10', role: 'GUARD', threshold: 10 },
    { id: 'guard-win-20', role: 'GUARD', threshold: 20 },
    { id: 'guard-win-30', role: 'GUARD', threshold: 30 },
    { id: 'witch-hunter-win-10', role: 'WITCH_HUNTER', threshold: 10 },
    { id: 'witch-hunter-win-20', role: 'WITCH_HUNTER', threshold: 20 },
    { id: 'witch-hunter-win-30', role: 'WITCH_HUNTER', threshold: 30 },
];

test('AC-01: 합계 22개(기록 7 + 직업 15)다', () => {
    assert.equal(ACHIEVEMENT_DEFINITIONS.length, 22);
    assert.equal(FORBIDDEN_RECORD_ACHIEVEMENTS.length, 7);
    assert.equal(JOB_ACHIEVEMENTS.length, 15);
});

test('AC-01: 금지된 기록 7개의 id·순서·판정 조건이 프론트 정의와 같다', () => {
    assert.deepEqual(
        FORBIDDEN_RECORD_ACHIEVEMENTS.map(({ id, metric, threshold }) => ({ id, metric, threshold })),
        EXPECTED_FORBIDDEN_RECORDS,
    );
});

test('AC-01: 직업 도전과제 15개의 id·순서·역할·판정 조건이 프론트 정의와 같다(witch-hunter 케밥케이스 포함)', () => {
    assert.deepEqual(
        JOB_ACHIEVEMENTS.map(({ id, role, threshold }) => ({ id, role, threshold })),
        EXPECTED_JOB_ACHIEVEMENTS,
    );
});

test('AC-01: 22개 id에 중복이 없다', () => {
    const ids = ACHIEVEMENT_DEFINITIONS.map((def) => def.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('AC-01: ACHIEVEMENT_DEFINITIONS 전체 순서는 기록 7개 다음에 직업 15개다', () => {
    const ids = ACHIEVEMENT_DEFINITIONS.map((def) => def.id);
    assert.deepEqual(ids.slice(0, 7), EXPECTED_FORBIDDEN_RECORDS.map((r) => r.id));
    assert.deepEqual(ids.slice(7), EXPECTED_JOB_ACHIEVEMENTS.map((r) => r.id));
});

test('A-02: 금지된 기록 7개는 전부 골드 50 + 다이아 50 보상이다(아이콘 파일명 숫자를 쓰지 않는다)', () => {
    for (const def of FORBIDDEN_RECORD_ACHIEVEMENTS) {
        assert.deepEqual(def.rewards, [
            { type: 'CURRENCY', currency: 'GOLD', amount: 50 },
            { type: 'CURRENCY', currency: 'DIAMOND', amount: 50 },
        ]);
    }
});

test('A-02: 직업 10승은 골드10·다이아10, 20승은 골드20·다이아30, 30승은 테두리 아이템이다', () => {
    for (const idPrefix of ['noble', 'clown', 'doctor', 'guard', 'witch-hunter']) {
        const win10 = getAchievementDefinition(`${idPrefix}-win-10`);
        const win20 = getAchievementDefinition(`${idPrefix}-win-20`);
        const win30 = getAchievementDefinition(`${idPrefix}-win-30`);

        assert.deepEqual(win10.rewards, [
            { type: 'CURRENCY', currency: 'GOLD', amount: 10 },
            { type: 'CURRENCY', currency: 'DIAMOND', amount: 10 },
        ]);
        assert.deepEqual(win20.rewards, [
            { type: 'CURRENCY', currency: 'GOLD', amount: 20 },
            { type: 'CURRENCY', currency: 'DIAMOND', amount: 30 },
        ]);
        assert.equal(win30.rewards.length, 1);
        assert.equal(win30.rewards[0].type, 'ITEM');
        assert.equal(win30.rewards[0].itemType, 'PROFILE_BORDER');
        assert.ok(win30.rewards[0].itemId.startsWith('profile-border-'));
    }
});

test('A-02: 직업별 30승 테두리 itemId가 서로 다르고 직업 수(5개)와 같다', () => {
    const win30ItemIds = JOB_ACHIEVEMENTS.filter((def) => def.threshold === 30).map((def) => def.rewards[0].itemId);
    assert.equal(win30ItemIds.length, 5);
    assert.equal(new Set(win30ItemIds).size, 5);
});

test('getAchievementDefinition: 존재하지 않는 id는 undefined다', () => {
    assert.equal(getAchievementDefinition('no-such-id'), undefined);
});

test('AC-01: 실제 frontend/spreadMeta.js의 FORBIDDEN_RECORDS_SPREAD_META 7개 id·순서가 백엔드 정의와 정확히 일치한다', async () => {
    const mod = await import(pathToFileURL(FRONTEND_SPREAD_META_PATH).href);
    const frontendIds = mod.FORBIDDEN_RECORDS_SPREAD_META.map((entry) => entry.id);
    assert.deepEqual(frontendIds, FORBIDDEN_RECORD_ACHIEVEMENTS.map((def) => def.id));
});

test('AC-01: 실제 frontend/jobChallenges.js의 INVITED_GUESTS_JOB_CHALLENGES 15개 id·순서가 백엔드 정의와 정확히 일치한다', async () => {
    const mod = await import(pathToFileURL(FRONTEND_JOB_CHALLENGES_PATH).href);
    const frontendIds = Object.values(mod.INVITED_GUESTS_JOB_CHALLENGES).flatMap((list) => list.map((c) => c.id));
    assert.deepEqual(frontendIds, JOB_ACHIEVEMENTS.map((def) => def.id));
});

test('A-02: 실제 frontend/jobChallenges.js의 통화 보상 수량(count)이 백엔드 정의(amount)와 일치한다(아이콘 파일명 숫자가 아니라 count 필드로 비교)', async () => {
    const mod = await import(pathToFileURL(FRONTEND_JOB_CHALLENGES_PATH).href);
    let checked = 0;
    for (const list of Object.values(mod.INVITED_GUESTS_JOB_CHALLENGES)) {
        for (const challenge of list) {
            const backendDef = getAchievementDefinition(challenge.id);
            assert.ok(backendDef, `${challenge.id}: 백엔드 정의가 없다`);
            const frontendCurrencyRewards = challenge.rewards.filter((r) => r.type === 'currency');
            const backendCurrencyRewards = backendDef.rewards.filter((r) => r.type === 'CURRENCY');
            assert.equal(frontendCurrencyRewards.length, backendCurrencyRewards.length, `${challenge.id}: 통화 보상 개수 불일치`);
            frontendCurrencyRewards.forEach((frontendReward, i) => {
                assert.equal(frontendReward.count, backendCurrencyRewards[i].amount, `${challenge.id}: 보상 수량 불일치`);
            });
            checked += 1;
        }
    }
    assert.equal(checked, 15);
});

test('A-02: 실제 frontend/spreadMeta.js의 금지된 기록 공통 보상 수량(FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS)이 백엔드 정의와 일치한다', async () => {
    const mod = await import(pathToFileURL(FRONTEND_SPREAD_META_PATH).href);
    const frontendCounts = mod.FORBIDDEN_RECORDS_DUMMY_UNLOCK_REWARDS.map((r) => r.count);
    for (const def of FORBIDDEN_RECORD_ACHIEVEMENTS) {
        assert.deepEqual(def.rewards.map((r) => r.amount), frontendCounts, `${def.id}: 보상 수량이 프론트 정의와 다르다`);
    }
});
