'use strict';

// F-12 22개 업적·자동 보상·서고 해금 — 실제 격리 MySQL DB에서 AC-02~AC-05를 검증한다.
//
// roleStatistics.mysql.test.js/voteParticipation.persistence.test.js와 같은 원칙
// (F01_TEST_DATABASE_URL 전용 격리 MySQL, backend/tests/helpers/isolatedTestDb.js의 관리
// 목록·대상 DB 확인)을 따른다. F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지
// 않고 명시적으로 skip하며 "미검증"임을 로그에 남긴다 — 격리 DB를 구할 수 없다고 통과를
// 꾸미지 않는다. achievement_grants(0009-add-achievement-grants) 유일 제약·
// economy_ledger_entries/economy_entitlements와의 실제 트랜잭션 원자성은 fake db로는
// 증명할 수 없으므로(achievementService.test.js는 fake로 로직만 검증한다) 이 파일이 그
// 근거를 보완한다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) throw connectionError;
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음
// require되는 이 시점에 격리 DB에 연결된다(roleStatistics.mysql.test.js와 같은 이유).
const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const achievementService = require('../../services/achievementService');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

const makePlayer = (uuid, role, alive) => [uuid, {
    uuid, nickname: `nick-${uuid.slice(0, 6)}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive, deathReason: null,
}];

// gameSessionCore.buildGameResultRecord는 session.winResult.winner와 player.team의 일치
// 여부로 won을 판정한다 — 이 헬퍼는 그 계산을 재현하지 않고, "이 유저가 이기게 하고
// 싶다"는 의도를 team/winner 조합으로 직접 표현한다(roleStatistics.mysql.test.js의
// makeEndedSession과 동일한 패턴).
const makeEndedSession = (id, playersMap, { winner = 'CITIZEN', gameSource = 'production' } = {}) => ({
    id,
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner },
    gameSource,
    players: playersMap,
});

// 같은 유저가 같은 역할로 N번 "확정 승리"한 경기를 순서대로 저장한다(소급 X — 매번 새
// game_id). role이 CITIZEN이면 winner도 CITIZEN으로 둬 team(=CITIZEN) === winner가 되게
// 하고, role이 JOKER면 winner도 JOKER로 둔다 — 그 외 역할(DOCTOR/GUARD/WITCH_HUNTER)은
// team이 항상 CITIZEN이므로 winner='CITIZEN'이면 승리한다.
const winnerForRole = (role) => (role === 'JOKER' ? 'JOKER' : 'CITIZEN');

const persistWins = async (userId, role, count) => {
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        const session = makeEndedSession(gameId, new Map([makePlayer(userId, role, true)]), { winner: winnerForRole(role) });
        const result = await gameResultRepository.persistGameResult(session, { completed: true });
        assert.equal(result.persisted, true);
    }
};

const getWalletRow = async (userId) => db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });
const getEntitlement = async (userId, itemId) => db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId }, raw: true });

test('AC-02/AC-03: 귀족으로 10승하면 noble-win-10이 지급되고 지갑에 골드10·다이아10이 반영된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('noble10');
    await persistWins(userId, 'CITIZEN', 10);

    const results = await achievementService.evaluateAndGrantForUser(userId);
    const noble10 = results.find((r) => r.id === 'noble-win-10');
    assert.equal(noble10.achieved, true);
    assert.equal(noble10.granted, true);

    const grantRow = await db.AchievementGrant.findOne({ where: { user_id: userId, achievement_id: 'noble-win-10' }, raw: true });
    assert.ok(grantRow, 'achievement_grants 행이 실제로 커밋돼야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 10);
    assert.equal(wallet.balance_diamond, 10);
});

test('AC-03: 직업 30승은 테두리 소유권을 카탈로그 계약대로 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('noble30');
    await persistWins(userId, 'CITIZEN', 30);

    const results = await achievementService.evaluateAndGrantForUser(userId);
    const noble30 = results.find((r) => r.id === 'noble-win-30');
    assert.equal(noble30.granted, true);

    const entitlement = await getEntitlement(userId, 'profile-border-귀족');
    assert.ok(entitlement, '직업 테두리 소유권이 economy_entitlements에 실제로 생겨야 한다');
    assert.equal(entitlement.item_type, 'PROFILE_BORDER');
    assert.equal(entitlement.source, 'ACHIEVEMENT_GRANT');
});

test('AC-04: 실제 DB 경합(동시 평가 요청)에서도 같은 업적은 정확히 한 번만 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('race12');
    await persistWins(userId, 'CITIZEN', 10);

    await Promise.all([
        achievementService.evaluateAndGrantForUser(userId),
        achievementService.evaluateAndGrantForUser(userId),
    ]);

    const grantCount = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'noble-win-10' } });
    assert.equal(grantCount, 1, '동시 요청이어도 achievement_grants 유일 제약으로 한 번만 남아야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 10, '동시 요청이 재화를 두 번 지급하면 안 된다');
});

test('AC-04: 페이지 재진입(재평가) 재시도는 이미 지급된 업적을 다시 지급하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('retry1');
    await persistWins(userId, 'CITIZEN', 10);

    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 10);
    assert.equal(wallet.balance_diamond, 10);
});

test('AC-05: 중단 경기 참가자는 진행률에 반영되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('aborted1');
    // 완료되지 않은(중단) 경기 — completed:false. 이 유저를 이탈자로 만들어도 won=false만
    // 확정되고, 정상 확정 경기가 아니므로 achievementService 진행률에는 반영되면 안 된다.
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(userId, 'CITIZEN', false)]), { winner: 'CITIZEN' });
    await gameResultRepository.persistGameResult(session, { completed: false, disconnectedUuid: userId });

    const stats = await gameResultRepository.getAchievementProgressStats(userId);
    assert.equal(stats.completedGames, 0, '중단 경기는 정상 확정 경기 수에 포함되면 안 된다');

    const results = await achievementService.evaluateAndGrantForUser(userId);
    assert.equal(results.every((r) => !r.achieved), true);
});

test('AC-05: 개발 경기는 진행률에 반영되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('devgame1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(userId, 'CITIZEN', true)]), { winner: 'CITIZEN', gameSource: 'development' });
    await gameResultRepository.persistGameResult(session, { completed: true });

    const stats = await gameResultRepository.getAchievementProgressStats(userId);
    assert.equal(stats.completedGames, 0, '개발 경기는 진행률에 포함되면 안 된다');
});

test('AC-05: 이 기능이 생기기 전부터 이미 쌓여 있던 과거 확정 경기도 다음 평가 호출에서 한 번에 소급 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('retro1');
    // achievementService를 한 번도 거치지 않고(트리거 없이) 과거 경기 3판을 먼저 저장한다
    // — "이 기능이 배포되기 전에 이미 쌓여 있던 기록"을 흉내낸다.
    await persistWins(userId, 'CITIZEN', 3);

    const before = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(before, 0, '트리거 전에는 어떤 업적도 지급돼 있지 않아야 한다');

    // 페이지 방문이 아니라, 그 계정이 처음으로 트리거를 만드는 순간(다음 게임/투표)을
    // 흉내낸 단일 호출.
    const results = await achievementService.evaluateAndGrantForUser(userId);
    const record1 = results.find((r) => r.id === 'record-1-masquerade');
    assert.equal(record1.granted, true, '게임 3회 완료 기록이 소급으로 한 번에 지급돼야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50);
    assert.equal(wallet.balance_diamond, 50);
});
