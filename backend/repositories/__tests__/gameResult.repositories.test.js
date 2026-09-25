'use strict';

// CO S-1(AC-01): getAccountRecordSummaries — 인게임 전적 목록이 쓰는 "계정 총 판수·승률"의
// 유일한 원천을 실제 격리 MySQL에서 검증한다.
//
// 인메모리 fake db로는 확정할 수 없는 것만 여기서 본다: user_id IN (...) 일괄 조회가 여러
// 계정을 정말 한 번에 갈라 돌려주는지, settings(JSON) JOIN 필터가 실제 왕복에서도
// development·test 출처를 걸러내는지, MySQL이 TINYINT로 돌려주는 won/is_alive가 정규화를
// 거쳐 집계까지 도달하는지, 그리고 역할이 여럿인 계정의 승률이 **역할별 승률의 평균이 아니라
// 판수 가중 합산**인지.
//
// roleStatistics.mysql.test.js와 같은 원칙을 따른다: F01_TEST_DATABASE_URL 전용 격리 MySQL,
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인. 값이 없으면 실패로
// 표시하지 않고 명시적으로 skip하며 **미검증**임을 남긴다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const { buildManagedSchema, resetManagedSchema } = require('../../tests/helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
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

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음 require되는
// 이 시점에 격리 DB에 연결된다(roleStatistics.mysql.test.js와 같은 이유·같은 자리).
const db = require('../../models');
const gameResultRepository = require('../gameResult.repositories');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

const makePlayer = (uuid, role, alive = true) => [uuid, {
    uuid,
    nickname: `nick-${uuid.slice(0, 6)}`,
    role,
    team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive,
    deathReason: null,
}];

const makeEndedSession = (playersMap, overrides = {}) => ({
    id: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner: 'CITIZEN' },
    gameSource: 'production',
    players: playersMap,
    ...overrides,
});

/** 승패가 확정된 한 판을 실제 저장 경로로 심는다(winner와 team이 같으면 승리다). */
const seedFinishedGame = async (uuid, role, { winner = 'CITIZEN', gameSource = 'production' } = {}) => {
    const session = makeEndedSession(new Map([makePlayer(uuid, role, true)]), {
        winResult: { winner },
        gameSource,
    });
    const result = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.equal(result.persisted, true, '시드 자체가 저장되지 않으면 이 시험은 아무것도 증명하지 못한다');
    return session.id;
};

// ── AC-01 ────────────────────────────────────────────────────────────────────

test('AC-01: 여러 계정을 한 번에 조회하고, 역할이 갈린 계정도 판수 가중 합산으로 {3, 67}을 돌려준다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const withRecords = await createLocalUser('rec');     // 시민 1승/2판 + 광대 1승/1판
    const withoutRecords = await createLocalUser('none'); // 판 기록 없음
    const excludedOnly = await createLocalUser('excl');   // development·test 출처만 있음
    const leaver = await createLocalUser('leav');         // 중단 경기의 이탈자(잔류자 대조용)

    // 집계에 들어가야 하는 3판(2승) — 시민 1승 1패, 광대 1승.
    await seedFinishedGame(withRecords, 'CITIZEN', { winner: 'CITIZEN' });
    await seedFinishedGame(withRecords, 'CITIZEN', { winner: 'JOKER' });
    await seedFinishedGame(withRecords, 'JOKER', { winner: 'JOKER' });

    // 집계에서 빠져야 하는 판들 — 하나라도 새어 들어오면 아래 {3, 67}이 깨진다.
    await seedFinishedGame(withRecords, 'CITIZEN', { winner: 'CITIZEN', gameSource: 'development' });
    await seedFinishedGame(withRecords, 'CITIZEN', { winner: 'CITIZEN', gameSource: 'test' });

    // 중단 경기의 잔류자(won=null). 이탈자만 패배로 확정되고 잔류자는 미확정으로 남는다.
    const abortedSession = makeEndedSession(new Map([
        makePlayer(withRecords, 'CITIZEN', true),
        makePlayer(leaver, 'CITIZEN', true),
    ]), { winResult: null });
    await gameResultRepository.persistGameResult(abortedSession, { completed: false, disconnectedUuid: leaver });
    const abortedRow = await db.GameResultPlayer.findOne({
        where: { game_id: abortedSession.id, user_id: withRecords }, raw: true,
    });
    assert.equal(abortedRow.won, null, '잔류자의 승패는 미확정(null)이어야 이 시험이 그 제외를 검증한다');

    // 5개 고정 역할 밖의 옛 역할 코드가 남아 있는 행(정책이 모르는 역할은 세지 않는다).
    const legacyGameId = crypto.randomUUID();
    await db.GameResult.create({
        id: legacyGameId,
        room_id: null,
        started_at: new Date(Date.now() - 60_000),
        ended_at: new Date(),
        winner: 'CITIZEN',
        win_reason: null,
        day_index: 2,
        player_count: 1,
        settings: { gameSource: { v: 1, value: 'production' } },
        completed: true,
    });
    await db.GameResultPlayer.create({
        game_id: legacyGameId,
        user_id: withRecords,
        nickname_snapshot: 'legacy',
        role: 'MAYOR',
        team: 'CITIZEN',
        won: true,
        is_alive: true,
        death_reason: null,
    });

    // excludedOnly에는 제외 출처의 판만 있다.
    await seedFinishedGame(excludedOnly, 'CITIZEN', { winner: 'CITIZEN', gameSource: 'development' });
    await seedFinishedGame(excludedOnly, 'GUARD', { winner: 'CITIZEN', gameSource: 'test' });

    const summaries = await gameResultRepository.getAccountRecordSummaries([
        withRecords, withoutRecords, excludedOnly,
    ]);

    assert.ok(summaries instanceof Map, '호출부가 uuid로 바로 찾을 수 있어야 하므로 Map이어야 한다');
    assert.deepEqual(
        [...summaries.keys()].sort(),
        [withRecords, withoutRecords, excludedOnly].sort(),
        '요청한 계정만, 요청한 계정 전부가 결과에 있어야 한다',
    );

    assert.deepEqual(
        summaries.get(withRecords),
        { totalGames: 3, winRate: 67 },
        '유효 3판 2승이어야 한다 — development·test·won=null·미지 역할이 하나라도 섞이면 이 값이 달라진다',
    );
    assert.deepEqual(
        summaries.get(withoutRecords),
        { totalGames: 0, winRate: 0 },
        '판 기록이 없는 계정도 결과에서 빠지지 않고 0판 0%로 들어 있어야 한다',
    );
    assert.deepEqual(
        summaries.get(excludedOnly),
        { totalGames: 0, winRate: 0 },
        'development·test 출처의 판만 있는 계정은 0판이어야 한다',
    );

    // 역할별 승률의 평균(50% + 100% ÷ 2 = 75%)이 아니라 판수 가중 합산(2/3 = 67%)이다.
    assert.notEqual(summaries.get(withRecords).winRate, 75, '역할별 승률 평균으로 계산하면 안 된다');

    // 같은 계정을 서고 통계(역할별)로 물어도 판수·승수 합계가 정확히 일치해야 한다 — 두 화면이
    // 같은 계정에 대해 다른 전적을 말하면 둘 중 하나는 반드시 거짓이다.
    const roleStats = await gameResultRepository.getMyRoleStatistics(withRecords);
    const roleGames = roleStats.reduce((sum, entry) => sum + entry.games, 0);
    const roleWins = roleStats.reduce((sum, entry) => sum + entry.wins, 0);
    assert.equal(roleGames, summaries.get(withRecords).totalGames, '역할별 판수 합계와 총 판수가 갈라지면 안 된다');
    assert.equal(roleWins, 2, '역할별 승수 합계도 같은 근거에서 나와야 한다');
    assert.equal(
        Math.round((roleWins / roleGames) * 100),
        summaries.get(withRecords).winRate,
        '승률은 역할별 집계에서 그대로 유도돼야 한다',
    );
});

test('AC-01: 빈 목록은 DB를 건드리지 않고 빈 Map을 돌려주고, 중복 uuid는 한 항목으로 접힌다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const original = db.GameResultPlayer.findAll;
    let queries = 0;
    db.GameResultPlayer.findAll = (...args) => { queries += 1; return original.apply(db.GameResultPlayer, args); };
    t.after(() => { db.GameResultPlayer.findAll = original; });

    const empty = await gameResultRepository.getAccountRecordSummaries([]);
    assert.equal(empty.size, 0);
    assert.equal(queries, 0, '조회할 계정이 없으면 쿼리를 보내지 않아야 한다');

    const uuid = await createLocalUser('dup');
    await seedFinishedGame(uuid, 'DOCTOR', { winner: 'CITIZEN' });

    // 저장 경로도 game_result_players를 읽는다(most_played_role 갱신) — 이 시험이 세려는 것은
    // 조회 함수 자신의 왕복뿐이므로 시드가 끝난 지점에서 다시 0부터 센다.
    queries = 0;
    const summaries = await gameResultRepository.getAccountRecordSummaries([uuid, uuid, uuid]);
    assert.equal(queries, 1, '중복이 있어도 조회는 한 번이어야 한다');
    assert.equal(summaries.size, 1, '같은 uuid가 여러 번 들어와도 결과는 한 항목이다');
    assert.deepEqual(summaries.get(uuid), { totalGames: 1, winRate: 100 });
});
