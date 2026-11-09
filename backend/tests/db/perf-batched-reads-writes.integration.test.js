'use strict';

// 진짜 DB 시험: 입장·시작·끝 질의 줄이기(2026-11-09) 뒤에도 결과가 전과 같은지
// 판 저장 한 번만(넣기 한 번·동시 저장)·통계 한 문장·팔레트 묶어 읽기·기본 지급 기억·업적 미리 읽기, F01_TEST_DATABASE_URL 없으면 건너뜀
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
});

const db = require('../../models');
const economyService = require('../../services/economy');
const { ensureDefaultsOnce } = require('../../services/economy/defaults');
const gameResultRepository = require('../../repositories/game/result');
const achievementService = require('../../services/achievement');
const { loadProgress } = require('../../services/achievement/progress');
const grantRepository = require('../../repositories/achievement');

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
        await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
        await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await db.sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 DB 없이는 못 봄 (미검증)');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB 준비 실패 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

// 계정·통계 행 + 기본 지급 (가입과 같은 상태)
const createAccount = async (label, stats = {}) => {
    const uuid = crypto.randomUUID();
    await db.User.create({ uuid, password_hash: 'x', nickname: `${label}${uuid.slice(0, 5)}`, email: `${label}-${uuid}@example.com` });
    await db.UserStats.create({ user_id: uuid, ...stats });
    await economyService.ensureDefaultEntitlements(uuid, db);
    return uuid;
};

// 판 기록 하나 (사람마다 역할·생존·처형)
const makeRecord = (people) => {
    const gameId = crypto.randomUUID();
    const settings = { gameSource: { v: 1, value: 'production' } };
    return {
        result: {
            id: gameId, room_id: 'room', winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED', completed: true,
            day_index: 2, player_count: people.length, started_at: new Date(1_000), ended_at: new Date(2_000), settings,
        },
        players: people.map(({ uuid, role, alive, executed }) => ({
            game_id: gameId, user_id: uuid, nickname_snapshot: 'n', role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
            won: role !== 'JOKER', is_alive: alive, death_reason: executed ? 'EXECUTION' : (alive ? null : 'ASSASSINATION'),
        })),
        stats: people.map(({ uuid, alive, executed }) => ({
            user_id: uuid, total_games: 1, survival_count: alive ? 1 : 0, execution_count: executed ? 1 : 0,
        })),
    };
};

const statsOf = async (uuid) => db.UserStats.findOne({ where: { user_id: uuid }, raw: true });

test('판 저장: 통계 한 문장이 사람마다 더하기·많이 한 직업을 맞게 바꾸고, 같은 판 두 번·동시 저장은 한 번만 셈', async (t) => {
    if (unavailable(t)) return;
    const a = await createAccount('sa', { total_games: 3, survival_count: 1, execution_count: 2, most_played_role: 'CITIZEN' });
    const b = await createAccount('sb');
    const c = await createAccount('sc');
    // a는 예전 판 의사 2번 (이번 판 시민 1번 더해도 의사가 많이 한 직업)
    const history = makeRecord([{ uuid: a, role: 'DOCTOR', alive: true }, { uuid: b, role: 'GUARD', alive: true }]);
    history.players.push({ ...history.players[0], user_id: a, game_id: history.result.id, role: 'DOCTOR' });
    await db.GameResult.create(history.result);
    await db.GameResultPlayer.bulkCreate([history.players[0]]);
    const second = makeRecord([{ uuid: a, role: 'DOCTOR', alive: true }]);
    await db.GameResult.create(second.result);
    await db.GameResultPlayer.bulkCreate(second.players);

    const record = makeRecord([
        { uuid: a, role: 'CITIZEN', alive: false, executed: true },
        { uuid: b, role: 'JOKER', alive: false, executed: true },
        { uuid: c, role: 'GUARD', alive: true },
    ]);
    const outcomes = await Promise.all([
        gameResultRepository.persistGameResultRecord(record),
        gameResultRepository.persistGameResultRecord(record),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.persisted).sort(), [false, true], '동시 저장 중 하나만 저장');
    assert.deepEqual(await gameResultRepository.persistGameResultRecord(record), { persisted: false, gameId: record.result.id });

    assert.equal(await db.GameResultPlayer.count({ where: { game_id: record.result.id } }), 3);
    const [statsA, statsB, statsC] = await Promise.all([statsOf(a), statsOf(b), statsOf(c)]);
    assert.deepEqual(
        [statsA.total_games, statsA.survival_count, statsA.execution_count, statsA.most_played_role],
        [4, 1, 3, 'DOCTOR'],
    );
    assert.deepEqual(
        [statsB.total_games, statsB.survival_count, statsB.execution_count, statsB.most_played_role],
        [1, 0, 1, 'JOKER'],
        '승패 정한 판만 셈: b는 이번 판 광대 한 번',
    );
    assert.deepEqual(
        [statsC.total_games, statsC.survival_count, statsC.execution_count, statsC.most_played_role],
        [1, 1, 0, 'GUARD'],
    );
});

test('팔레트 묶어 읽기: 한 명씩 읽기와 칸·보유가 같고, 행 없는 사람은 같은 기본값으로 만듦', async (t) => {
    if (unavailable(t)) return;
    const fresh = await createAccount('pf');
    const saved = await createAccount('ps');
    const before = await economyService.getEmojiPalette(saved);
    const slots = [...before.slots].reverse();
    await economyService.saveEmojiPalette(saved, { slots, expectedRevision: before.revision });

    const batch = await economyService.getEmojiPalettes([fresh, saved, fresh]);
    assert.equal(batch.size, 2);
    for (const uuid of [fresh, saved]) {
        const single = await economyService.getEmojiPalette(uuid);
        assert.deepEqual(batch.get(uuid).slots, single.slots);
        assert.equal(batch.get(uuid).revision, single.revision, '묶어 읽기가 만든 행을 한 명 읽기가 그대로 씀');
        assert.deepEqual([...batch.get(uuid).owned].sort(), [...single.owned].sort());
    }
    assert.deepEqual(batch.get(saved).slots, slots);
});

test('기본 지급 기억: 겹친 확인은 한 번만 돌고, 이미 본 사람은 null, 실패한 확인은 기억 안 함', async (t) => {
    if (unavailable(t)) return;
    economyService.__internal.forgetDefaultChecks();
    const uuid = await createAccount('mc');
    const [first, overlapped] = await Promise.all([ensureDefaultsOnce(uuid, db), ensureDefaultsOnce(uuid, db)]);
    assert.equal(first.user_id, uuid, '처음 확인은 방금 읽은 장착 행');
    assert.equal(overlapped, first, '겹친 확인은 같은 답');
    assert.equal(await ensureDefaultsOnce(uuid, db), null, '이미 본 사람은 다시 안 물음');

    const missing = crypto.randomUUID();
    await assert.rejects(() => ensureDefaultsOnce(missing, db));
    await assert.rejects(() => ensureDefaultsOnce(missing, db), '실패한 확인은 기억 안 해서 다시 물음');
});

test('업적 미리 읽기: 여러 명 한 번에 읽은 진행 값·받은 목록이 한 명씩 읽기와 같음', async (t) => {
    if (unavailable(t)) return;
    const a = await createAccount('aa');
    const b = await createAccount('ab');
    // 세 판 해야 받는 업적이 있어 a·b 세 판, a만 투표 참여 하나·업적 받아 둠
    for (let round = 0; round < 3; round += 1) {
        const record = makeRecord([{ uuid: a, role: 'DOCTOR', alive: true }, { uuid: b, role: 'JOKER', alive: false, executed: true }]);
        await gameResultRepository.persistGameResultRecord(record);
        if (round === 0) await db.VoteParticipation.create({ game_id: record.result.id, day_index: 1, user_id: a, accepted_at: new Date() });
    }
    await achievementService.evaluateAndGrantForUser(a);

    const preloaded = await achievementService.preloadForUsers([a, b]);
    for (const uuid of [a, b]) {
        const [progress, grants] = preloaded.get(uuid);
        assert.deepEqual(progress, await loadProgress(uuid));
        const single = await grantRepository.listGrantsByUser(db, uuid);
        assert.deepEqual(grants.map((grant) => grant.achievement_id).sort(), single.map((grant) => grant.achievement_id).sort());
    }
    assert.ok(preloaded.get(a)[1].length > 0, 'a는 첫 판 업적을 받아 둠');
    assert.deepEqual(
        await achievementService.evaluateAndGrantForUser(a, preloaded.get(a)),
        await achievementService.evaluateAndGrantForUser(a),
        '미리 읽은 값으로 평가해도 결과 같음',
    );
});
