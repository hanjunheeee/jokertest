'use strict';

// 직업 통계 DB 시험: 진짜 계정으로 그 직업을 맡아 이긴 판을 끝내 직업별 판 수·승 수가 맞게 세이는지, 시험 출처 판·출처 없는 옛 판 셈을 시험 DB에서 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-288~294 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
// 모델을 먼저 불러 시험 DB에 붙여 둠 (gameFixtures가 DATABASE_URL을 막는 값으로 바꾸기 전에)
const db = require('../../models');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const gameSettings = require('../../services/ops/gameSettings');
// 내 직업 통계 화면이 읽는 서비스 (직업 5개 전부, 안 해 본 직업은 0)
const roleStatistics = require('../../services/game/roleStatistics/queries');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { core } = gf;
const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    gs.__resetStateForTests();
    await db.sequelize.close();
});

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

// 시험마다 새 사람 n명 (계정 + 통계 한 줄), uuid가 달라 시험끼리 안 섞임
async function createUsers(n, label) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 4)}`.slice(0, 12),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        await db.UserStats.create({ user_id: uuid });
        uuids.push(uuid);
    }
    return uuids;
}

// 판 출처를 정해 둠 (판 만들 때 정해짐): 'test' = 시험 환경, 'production' = 운영 못박음, 끝에 되돌림
function setSource(t, source) {
    const saved = { NODE_ENV: process.env.NODE_ENV, GAME_SOURCE_OVERRIDE: process.env.GAME_SOURCE_OVERRIDE };
    if (source === 'production') process.env.GAME_SOURCE_OVERRIDE = 'production';
    else {
        delete process.env.GAME_SOURCE_OVERRIDE;
        process.env.NODE_ENV = 'test';
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
}

// 진짜 계정 5명으로 판 열기 (직업 고정 randomFn 0, 그 직업 1명 넣은 직접 구성) + 첫 낮
async function startGame(t, { label, role, source }) {
    gf.resetCore();
    gs.__resetStateForTests();
    setSource(t, source);
    gameSettings.__setGoldRewardForTests(1);
    const people = await createUsers(5, label);
    const counts = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...(role === 'CITIZEN' || role === 'JOKER' ? {} : { [role]: 1 }) };
    const room = {
        id: crypto.randomUUID(),
        players: new Map(people.map((uuid, i) => [uuid, { uuid, nickname: `${label}${i}`, isReady: true }])),
        settings: { maxPlayers: 10, jokerCount: 1, roleCompositionMode: 'custom', roleCounts: counts },
    };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => crypto.randomUUID() });
    assert.equal(candidate.ok, true, `판 만들기 거절: ${candidate.reason ?? candidate.code}`);
    core.commitGameSession(candidate.session);
    const session = candidate.session;
    session.goldReward = gameSettings.getGameGoldReward();
    gf.toDay(session);
    gf.socketWorld(gs, session);
    const signals = [];
    gs.setEmitToUser((uuid, event, payload) => signals.push({ uuid, event, payload }));
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
        gameSettings.__setGoldRewardForTests();
    });
    return { session, signals, player: gf.firstOf(session, role) };
}

// 피고 세우고 전원 유죄 → 판정 확정 (판 규칙 함수로)
function tribunal(session, defendant) {
    gf.toTribunal(session, defendant);
    for (const uuid of core.getTribunalVoterUuids(session, defendant)) {
        assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY').ok, true);
    }
    const anyone = [...session.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤마다 시민 암살 → 광대 승 (판 규칙 함수로만)
function finishJokerWin(session) {
    for (let i = 0; i < 12 && session.phase !== 'ENDED'; i += 1) {
        T.stopNightTurnSequence(session.id);
        gf.toNight(session);
        const joker = gf.firstOf(session, 'JOKER');
        const victim = [...session.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
        assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
        gf.skipAllNight(session);
        const prepared = core.prepareNightResolution(joker, session.id);
        assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
        assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
    }
    assert.equal(session.winResult?.winner, 'JOKER');
}

// 조건이 맞을 때까지 잠깐씩 다시 봄, 넉넉히 기다림 (표 처음 쓰기 7~13초)
async function waitFor(check, label, timeoutMs = 25_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > until) assert.fail(`${label} 기다리다 시간 넘김`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

// 그 직업 사람 편이 이기게 끝내고 서버 판 끝 저장 길 → 판 끝 처리 끝날 때까지
async function winAndPersist(ctx, role) {
    if (role === 'JOKER') finishJokerWin(ctx.session); else tribunal(ctx.session, gf.firstOf(ctx.session, 'JOKER'));
    T.persistTerminalSession(ctx.session, { completed: true });
    const uuids = [...ctx.session.players.keys()];
    await waitFor(() => uuids.every((u) => ctx.signals.some((e) => e.uuid === u
        && e.event === 'account_cache_invalidated' && e.payload.scopes.includes('economy'))), '판 끝 처리');
}

// 내 직업 통계에서 그 직업 줄
const statOf = async (uuid, role) => (await roleStatistics.getMyRoleStatistics(uuid)).find((row) => row.role === role);

const ROLES = [
    ['288', 'CITIZEN', '귀족(시민)'],
    ['289', 'JOKER', '광대'],
    ['290', 'DOCTOR', '의사'],
    ['291', 'GUARD', '경비원'],
    ['292', 'WITCH_HUNTER', '마녀사냥꾼'],
];

// ── A07-B-288~292: 직업별 판 수·승 수 ──

for (const [no, role, label] of ROLES) {
    test(`A07-B-${no} ${label}으로 1판 이김 → 그 직업 판 +1·승 +1`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { label: `s${no}`, role, source: 'production' });
        const before = await statOf(ctx.player, role);
        await winAndPersist(ctx, role);
        const after = await statOf(ctx.player, role);
        assert.equal(after.games, before.games + 1);
        assert.equal(after.wins, before.wins + 1);
    });
}

// ── A07-B-293~294: 판 출처 ──

test('A07-B-293 출처 test 판 → 직업 통계 그대로', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 's293', role: 'CITIZEN', source: 'test' });
    const before = await statOf(ctx.player, 'CITIZEN');
    await winAndPersist(ctx, 'CITIZEN');
    // 판 기록 줄은 남았는데 통계에만 안 셈
    assert.equal(await db.GameResultPlayer.count({ where: { game_id: ctx.session.id, user_id: ctx.player } }), 1);
    assert.deepEqual(await statOf(ctx.player, 'CITIZEN'), before);
});

test('A07-B-294 출처 칸 없는 옛 판 줄 → 셈', async (t) => {
    if (noDb(t)) return;
    const [uuid] = await createUsers(1, 's294');
    const before = await statOf(uuid, 'CITIZEN');
    // 출처를 적기 전 옛 판 모양 (settings에 gameSource 칸 없음)
    const id = crypto.randomUUID();
    const at = new Date(Date.UTC(2026, 5, 1));
    await db.GameResult.create({
        id, started_at: at, ended_at: at, winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED', day_index: 2, player_count: 5,
        settings: { jokerCount: 1 }, completed: true,
    });
    await db.GameResultPlayer.create({ game_id: id, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN', won: true, is_alive: true });
    const after = await statOf(uuid, 'CITIZEN');
    assert.equal(after.games, before.games + 1);
    assert.equal(after.wins, before.wins + 1);
});
