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
// CODEX-1 재검토(AC-03/AC-04): persistWins(userId, 'CITIZEN', N)으로 쌓은 승수는 noble-win-*
// 뿐 아니라 completedGames·survivals·wins(직업 무관) 지표도 함께 채운다 — 예를 들어 10승은
// noble-win-10과 동시에 record-1-masquerade(3게임 완료)·record-3-first-morning(5생존)·
// record-5-clown-story(10승)까지 함께 달성시킨다(N에 따라 record-4/6/7도 함께 달성될 수
// 있다). 그래서 지갑 "총" 잔액을 특정 업적 하나의 보상액과 그대로 비교하면(예: ===10) 다른
// 업적이 함께 지급한 금액까지 섞여 실패한다 — 이전 회차는 이 겹침을 계산에 넣지 않고
// wallet.balance_gold===10만 기대해 실제 DB에서는 실패했다. 검증 대상 업적의
// reference_event_id로 원장 항목을 직접 조회해, 다른 업적이 동시에 얼마를 지급했든 그
// 업적 자신의 지급 금액과 지급 횟수만 독립적으로 확인한다.
const getLedgerEntry = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.findOne({ where: { user_id: userId, reference_event_id: referenceEventId }, raw: true });
const countLedgerEntries = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.count({ where: { user_id: userId, reference_event_id: referenceEventId } });

test('AC-02/AC-03: 귀족으로 10승하면 noble-win-10이 지급되고 그 업적 몫의 원장(골드10·다이아10)이 정확히 기록된다', async (t) => {
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

    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    const diamondEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:DIAMOND');
    assert.ok(goldEntry, 'noble-win-10 골드 지급 원장 항목이 있어야 한다');
    assert.ok(diamondEntry, 'noble-win-10 다이아 지급 원장 항목이 있어야 한다');
    assert.equal(goldEntry.amount, 10);
    assert.equal(diamondEntry.amount, 10);
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

    // 이 시나리오(10승)는 noble-win-10과 함께 record-1/3/5도 동시에 달성시킨다(위 헬퍼 주석
    // 참고) — 지갑 총액이 아니라 noble-win-10 자신의 원장 항목 개수·금액만 확인한다.
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:GOLD'), 1, '동시 요청이 noble-win-10 골드를 두 번 지급하면 안 된다');
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:DIAMOND'), 1, '동시 요청이 noble-win-10 다이아를 두 번 지급하면 안 된다');
    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    assert.equal(goldEntry.amount, 10);
});

test('AC-04: 페이지 재진입(재평가) 재시도는 이미 지급된 업적을 다시 지급하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('retry1');
    await persistWins(userId, 'CITIZEN', 10);

    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);

    // 이 시나리오(10승)는 noble-win-10과 함께 record-1/3/5도 동시에 달성시킨다 — 지갑
    // 총액이 아니라 noble-win-10 자신의 원장 항목 개수·금액만 확인한다.
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:GOLD'), 1, '재시도가 noble-win-10 골드를 중복 지급하면 안 된다');
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:DIAMOND'), 1, '재시도가 noble-win-10 다이아를 중복 지급하면 안 된다');
    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    const diamondEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:DIAMOND');
    assert.equal(goldEntry.amount, 10);
    assert.equal(diamondEntry.amount, 10);
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

// CODEX-2 재검토(AC-03): 이전 회차는 지갑 "총" 잔액 기대값이 실제로는 여러 업적의 보상이
// 겹쳐 틀렸다는 지적을 받아, 특정 업적의 원장 항목만 개별로 확인하는 방식으로 바꿨다 —
// 하지만 그 수정은 "동시 달성 전체 지갑 합계"를 검증해야 한다는 원래 요구를 채우지 못했다
// (개별 원장 검사만으로는 여러 업적이 동시에 지급될 때 지갑 최종 합계가 정확히 그 총합과
// 일치하는지 증명하지 못한다). 이 시험은 30승으로 동시에 걸리는 9개 업적(기록 6개 +
// noble-win-10/20/30) 전부를 정확히 계산한 뒤, 지갑 "총" 잔액이 그 합과 정확히 일치하는지
// 확인한다 — 기록 6개(50G+50D×6=300G/300D) + noble-10(10G/10D) + noble-20(20G/30D) =
// 330G/340D, noble-30은 재화 없이 테두리 아이템만. 또한 evaluateAndGrantForUser를 동시에
// 두 번(Promise.all) 실행해, 9개 업적 전부가 동시에 경합해도(AC-04) 이 총액이 두 배로
// 지급되지 않는지도 함께 확인한다.
test('AC-03/AC-04: 30승으로 9개 업적이 동시에 걸려도(동시 평가 포함) 지갑 총액·지급 개수·테두리 소유권이 정확히 일치한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('multi30');
    await persistWins(userId, 'CITIZEN', 30);

    // AC-04: 동시에 두 번 평가해도(9개 업적 전부가 동시에 경합) 총액이 두 배가 되면 안 된다.
    await Promise.all([
        achievementService.evaluateAndGrantForUser(userId),
        achievementService.evaluateAndGrantForUser(userId),
    ]);

    const grantRows = await db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id'], raw: true });
    const grantIds = grantRows.map((g) => g.achievement_id);
    assert.equal(new Set(grantIds).size, grantIds.length, '동시 평가로 같은 업적이 중복 지급되면 안 된다');
    assert.deepEqual(
        [...grantIds].sort(),
        ['noble-win-10', 'noble-win-20', 'noble-win-30', 'record-1-masquerade', 'record-3-first-morning', 'record-4-testimonies', 'record-5-clown-story', 'record-6-dead-mans-leaving', 'record-7-erased-night'].sort(),
        '30승 계정은 정확히 이 9개 업적만 달성해야 한다(record-2는 투표 참여, 다른 직업 업적은 역할이 달라 제외)',
    );

    const wallet = await getWalletRow(userId);
    // 기록 6개 × (50G+50D) = 300G/300D, + noble-win-10(10G/10D) + noble-win-20(20G/30D).
    assert.equal(wallet.balance_gold, 330, '지갑 총 골드가 9개 업적 보상의 합과 정확히 일치해야 한다');
    assert.equal(wallet.balance_diamond, 340, '지갑 총 다이아가 9개 업적 보상의 합과 정확히 일치해야 한다');

    const entitlement = await getEntitlement(userId, 'profile-border-귀족');
    assert.ok(entitlement, 'noble-win-30 테두리 소유권도 함께 지급되어야 한다');

    // 재평가(페이지 재진입 흉내)해도 총액이 늘어나면 안 된다(AC-04).
    await achievementService.evaluateAndGrantForUser(userId);
    const walletAfterRetry = await getWalletRow(userId);
    assert.equal(walletAfterRetry.balance_gold, 330);
    assert.equal(walletAfterRetry.balance_diamond, 340);
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
