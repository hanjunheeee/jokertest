'use strict';

// 판 골드 지갑·장부 DB 시험: 진짜 계정으로 판을 끝내 지갑·장부(economy_ledger_entries)에 판 골드가 맞게 남는지 시험 DB에서 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-185~216 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
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
const economyGrants = require('../../services/economy/grants');
const ledgerRepository = require('../../repositories/economy/ledger');
const { MAX_BALANCE } = require('../../services/economy/constants');
const recordService = require('../../services/game/record');
const money = require('../admin/helpers/money');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

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

// 진짜 계정으로 판 열기 (직업 고정 randomFn 0) + 첫 낮 + 판 골드 값(판 시작이 넣는 값과 같게)
// uuids 주면 그 사람들로 (같은 사람 두 판), 받은 다시 읽기 신호는 signals에 모음
async function startGame(t, { n, label, gold = 1, jokers = 1, uuids = null, extraUuids = [] }) {
    gf.resetCore();
    gs.__resetStateForTests();
    gameSettings.__setGoldRewardForTests(gold);
    const people = uuids ?? [...(await createUsers(n - extraUuids.length, label)), ...extraUuids];
    const room = {
        id: crypto.randomUUID(),
        players: new Map(people.map((uuid, i) => [uuid, { uuid, nickname: `${label}${i}`, isReady: true }])),
        settings: { maxPlayers: 10, jokerCount: jokers, roleCompositionMode: 'custom', roleCounts: { JOKER: jokers, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
    };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => crypto.randomUUID() });
    assert.equal(candidate.ok, true, `판 만들기 거절: ${candidate.reason ?? candidate.code}`);
    core.commitGameSession(candidate.session);
    const session = candidate.session;
    session.goldReward = gameSettings.getGameGoldReward();
    gf.toDay(session);
    const world = gf.socketWorld(gs, session);
    const signals = [];
    gs.setEmitToUser((uuid, event, payload) => signals.push({ uuid, event, payload }));
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
        gameSettings.__setGoldRewardForTests();
    });
    return { session, world, signals, jokers: gf.byRole(session, 'JOKER'), citizens: gf.nonJokers(session) };
}

const clockFns = (clock) => ({ nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

// 피고 세우고 투표할 사람 전원 같은 표 → 판정 확정 (판 규칙 함수로, 전적 저장은 따로)
function tribunal(session, defendant, vote = 'GUILTY') {
    gf.toTribunal(session, defendant);
    for (const uuid of core.getTribunalVoterUuids(session, defendant)) {
        assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, vote).ok, true);
    }
    const anyone = [...session.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `재판 확정 실패: ${committed.code}`);
    return committed;
}

// 밤 하나 (광대가 victim 죽임, null이면 안 죽임) → 서버 밤 마무리 길 (판이 끝나면 방송·전적 저장까지 감)
function night(ctx, victim = null) {
    const { session, world } = ctx;
    T.stopNightTurnSequence(session.id);
    T.stopDayPhaseTimer(session.id);
    gf.toNight(session);
    const joker = gf.byRole(session, 'JOKER').find((u) => session.players.get(u).alive);
    if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
    gf.skipAllNight(session);
    assert.equal(T.finalizeNightForSession(world.io, session).ok, true);
    T.stopDayPhaseTimer(session.id);
}

// 밤 하나를 판 규칙 함수로만 (방송·저장 없음)
function nightCoreOnly(session, victim = null) {
    T.stopNightTurnSequence(session.id);
    gf.toNight(session);
    const joker = gf.byRole(session, 'JOKER').find((u) => session.players.get(u).alive);
    if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
    gf.skipAllNight(session);
    const prepared = core.prepareNightResolution(joker, session.id);
    assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
    assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤마다 산 시민을 죽여 광대 승으로 끝냄 (spare는 안 죽임), 마지막 밤이 전적 저장을 엶
function finishJokerWin(ctx, { spare = [], coreOnly = false } = {}) {
    for (let i = 0; i < 12 && ctx.session.phase !== 'ENDED'; i += 1) {
        const victim = [...ctx.session.players.values()]
            .find((p) => p.alive && p.role !== 'JOKER' && !spare.includes(p.uuid)).uuid;
        if (coreOnly) nightCoreOnly(ctx.session, victim); else night(ctx, victim);
    }
    assert.equal(ctx.session.phase, 'ENDED');
    assert.equal(ctx.session.winResult?.winner, 'JOKER');
}

// 조건이 맞을 때까지 잠깐씩 다시 봄 (DB 쓰기는 기다리지 않는 길이라), 넉넉히 기다림 (표 처음 쓰기 7~13초)
async function waitFor(check, label, timeoutMs = 25_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > until) assert.fail(`${label} 기다리다 시간 넘김`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

// 판 끝 처리(저장 → 판 골드 → 업적)가 끝나 전원이 그 범위 다시 읽기 신호를 count번 받을 때까지
async function waitSignals(ctx, scope = 'economy', count = 1) {
    const uuids = [...ctx.session.players.keys()];
    await waitFor(() => uuids.every((u) => ctx.signals.filter((e) => e.uuid === u
        && e.event === 'account_cache_invalidated' && e.payload.scopes.includes(scope)).length >= count), `${scope} 다시 읽기 신호`);
}

const rewardRef = (gameId) => `game-reward:${gameId}`;
// 그 판 판 골드 장부 줄 (사람 하나)
const goldRows = (gameId, uuid) => db.EconomyLedgerEntry.findAll({
    where: { user_id: uuid, reference_event_id: rewardRef(gameId) }, raw: true,
});
// 그 사람 골드 지갑 (지갑 줄 없으면 0)
const goldOf = async (uuid) => (await money.walletOf(uuid)).gold;
const hasWallet = async (uuid) => (await db.sequelize.models.EconomyWallet.count({ where: { user_id: uuid } })) > 0;

// 판 시작 전 지갑 값 → Map(uuid → 골드)
async function goldBefore(uuids) {
    const before = new Map();
    for (const u of uuids) before.set(u, await goldOf(u));
    return before;
}

// 사람마다 "지갑 +amount, 판 골드 장부 한 줄(사유·금액·참조 id)" 확인
async function assertGotGold(gameId, uuid, before, amount) {
    const rows = await goldRows(gameId, uuid);
    assert.equal(rows.length, 1, `${uuid} 판 골드 장부 줄 수`);
    assert.equal(rows[0].reason, 'GAME_REWARD');
    assert.equal(Number(rows[0].amount), amount);
    assert.equal(rows[0].currency, 'GOLD');
    assert.equal(await goldOf(uuid), before + amount, `${uuid} 지갑 골드`);
}

// 사람 하나 "지갑 그대로, 판 골드 장부 0줄" 확인
async function assertNoGold(gameId, uuid, before) {
    assert.equal((await goldRows(gameId, uuid)).length, 0, `${uuid} 판 골드 장부 줄 없어야 함`);
    assert.equal(await goldOf(uuid), before, `${uuid} 지갑 그대로`);
}

// 업적 보상 판 준비: 출처를 운영으로 못박고(시험 출처는 업적 안 붙음) 끝에 되돌림
function productionSource(t) {
    const saved = process.env.GAME_SOURCE_OVERRIDE;
    process.env.GAME_SOURCE_OVERRIDE = 'production';
    t.after(() => {
        if (saved === undefined) delete process.env.GAME_SOURCE_OVERRIDE; else process.env.GAME_SOURCE_OVERRIDE = saved;
    });
}

// 옛 판 기록 n판 (운영 출처·끝까지 간 판) 넣기 → 업적 판 수 셈의 바탕
async function seedCompletedGames(uuid, count) {
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        const at = new Date(Date.UTC(2026, 9, 1 + i));
        await db.GameResult.create({
            id, started_at: at, ended_at: at, winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED', day_index: 2, player_count: 5,
            settings: { gameSource: { v: 1, value: 'production' } }, completed: true,
        });
        await db.GameResultPlayer.create({ game_id: id, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN', won: false, is_alive: false });
    }
}

// ── A07-B-185~190: 판 끝까지 가면 전원 지갑 +1, 장부 한 줄씩 ──

for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const no = String(185 + i).padStart(3, '0');
    test(`A07-B-${no} ${n}명 판 끝까지 (판 값 1) → 전원 지갑 +1, 장부 GAME_REWARD·1·game-reward:<판 id> 한 줄`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { n, label: `g${no}` });
        const before = await goldBefore(ctx.session.players.keys());
        finishJokerWin(ctx);
        await waitSignals(ctx);
        for (const u of ctx.session.players.keys()) await assertGotGold(ctx.session.id, u, before.get(u), 1);
    });
}

// ── A07-B-191~197: 받는 사람 7종 (8명 판, 광대 2, 광대 승) ──
// 1일 C1 산 채로 나감 · C2 끊김 60초 탈락 · J1 처형 → 밤 C3 암살 → C3 나감 → 2일 C4 처형 → 밤 C5 암살 → 광대 1 : 시민 1 광대 승
async function sevenKindsGame(t, no) {
    const ctx = await startGame(t, { n: 8, label: `g${no}`, jokers: 2 });
    const { session, world } = ctx;
    const [j1, j2] = ctx.jokers;
    const [c1, c2, c3, c4, c5, c6] = ctx.citizens;
    const before = await goldBefore(session.players.keys());
    assert.equal(T.applyParticipantDeparture(world.io, session, c1, { reason: 'PLAYER_LEFT' }).ok, true);
    const clock = gf.fakeClock();
    world.sock(c2).connected = false;
    T.beginDisconnectGrace(world.io, session, c2, clockFns(clock));
    clock.advance(60_000);
    assert.equal(session.players.get(c2).alive, false, 'C2 60초 탈락');
    T.stopDayPhaseTimer(session.id);
    assert.equal(tribunal(session, j1).terminal ?? null, null);
    night(ctx, c3);
    assert.equal(T.applyParticipantDeparture(world.io, session, c3, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(session.id);
    assert.equal(tribunal(session, c4).terminal ?? null, null);
    night(ctx, c5);
    assert.equal(session.winResult?.winner, 'JOKER');
    await waitSignals(ctx);
    return {
        ctx, before,
        kinds: { winAlive: j2, loseAlive: c6, winDead: j1, loseDead: c4, deadLeft: c3, leftAlive: c1, timedOut: c2 },
    };
}

const SEVEN_KINDS = [
    ['191', 'winAlive', '이긴 편 산 사람', 1],
    ['192', 'loseAlive', '진 편 산 사람', 1],
    ['193', 'winDead', '이긴 편 죽은 사람', 1],
    ['194', 'loseDead', '진 편 죽은 사람', 1],
    ['195', 'deadLeft', '죽은 뒤 나간 사람', 1],
    ['196', 'leftAlive', '산 채로 나간 사람', 0],
    ['197', 'timedOut', '끊김 60초 탈락한 사람', 0],
];
for (const [no, kind, label, amount] of SEVEN_KINDS) {
    const expect = amount ? '지갑 +1·장부 1줄' : '지갑 그대로·장부 0줄';
    test(`A07-B-${no} 8명 판 값 1 ${label} → ${expect}`, async (t) => {
        if (noDb(t)) return;
        const { ctx, before, kinds } = await sevenKindsGame(t, no);
        const uuid = kinds[kind];
        if (amount) await assertGotGold(ctx.session.id, uuid, before.get(uuid), 1);
        else await assertNoGold(ctx.session.id, uuid, before.get(uuid));
    });
}

// ── A07-B-198~201: 판 값대로 들어감 (6명 판) ──

for (const [i, gold] of [0, 1, 2, 100].entries()) {
    const no = String(198 + i);
    const expect = gold === 0 ? '지갑 그대로·장부 0줄' : `전원 +${gold}`;
    test(`A07-B-${no} 6명 판 판 값 ${gold} → ${expect}`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { n: 6, label: `g${no}`, gold });
        const before = await goldBefore(ctx.session.players.keys());
        finishJokerWin(ctx);
        await waitSignals(ctx);
        for (const u of ctx.session.players.keys()) {
            if (gold === 0) await assertNoGold(ctx.session.id, u, before.get(u));
            else await assertGotGold(ctx.session.id, u, before.get(u), gold);
        }
    });
}

// ── A07-B-202~204: 같은 판은 한 번만 ──

test('A07-B-202 5명 판 같은 판 기록·지급 두 번 → 사람마다 장부 1줄, 지갑 +1만', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 5, label: 'g202' });
    const before = await goldBefore(ctx.session.players.keys());
    finishJokerWin(ctx);
    await waitSignals(ctx);
    // 메모리 표식(같은 판 한 번만)을 지워 DB까지 두 번째 저장·지급이 가게 함 (서버를 다시 켠 것과 같음)
    recordService.__resetTerminalPersistForTests();
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitSignals(ctx, 'economy', 2);
    for (const u of ctx.session.players.keys()) await assertGotGold(ctx.session.id, u, before.get(u), 1);
});

test('A07-B-203 7명 판 같은 지급 묶음 두 번을 한꺼번에 → 사람마다 장부 1줄, 지갑 +1만', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 7, label: 'g203' });
    const before = await goldBefore(ctx.session.players.keys());
    // 판 규칙 함수로만 끝냄 (저장 길이 먼저 주지 않게), 지급 묶음 = 판 끝까지 있던 7명·값 1·이 판 참조 id
    finishJokerWin(ctx, { coreOnly: true });
    const grant = { userIds: [...ctx.session.players.keys()], amount: 1, referenceEventId: rewardRef(ctx.session.id) };
    await Promise.allSettled([economyGrants.grantGameRewards(grant), economyGrants.grantGameRewards(grant)]);
    for (const u of ctx.session.players.keys()) await assertGotGold(ctx.session.id, u, before.get(u), 1);
});

test('A07-B-204 5명 판 지급 거래 중간 DB 오류(되돌림) → 다시 함 → 사람마다 장부 1줄', async (t) => {
    if (noDb(t)) return;
    // 첫 지급 거래의 세 번째 장부 줄 쓰기에서 한 번만 끊김 흉내 (거래 통째 되돌림 → 1초 뒤 다시 하기)
    const original = ledgerRepository.createEntry;
    let calls = 0;
    let failed = false;
    t.mock.method(ledgerRepository, 'createEntry', (...args) => {
        calls += 1;
        if (calls === 3 && !failed) {
            failed = true;
            throw new Error('잠깐 DB 끊김 흉내');
        }
        return original(...args);
    });
    const ctx = await startGame(t, { n: 5, label: 'g204' });
    const before = await goldBefore(ctx.session.players.keys());
    finishJokerWin(ctx);
    const uuids = [...ctx.session.players.keys()];
    await waitFor(async () => {
        for (const u of uuids) if ((await goldRows(ctx.session.id, u)).length < 1) return false;
        return true;
    }, '다시 한 지급 장부 줄');
    assert.equal(failed, true, '끊김 흉내가 한 번 걸렸어야 함');
    for (const u of uuids) {
        await assertGotGold(ctx.session.id, u, before.get(u), 1);
        await money.assertWalletMatchesLedger(u);
    }
});

// ── A07-B-205: 점검 강제 종료 판 ──

test('A07-B-205 6명 판 값 1 점검으로 끝남 → 장부 GAME_REWARD 0줄, 지갑 그대로, win_reason MAINTENANCE', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 6, label: 'g205' });
    const before = await goldBefore(ctx.session.players.keys());
    assert.equal(abortGamesForMaintenance(ctx.world.io), 1);
    await waitFor(async () => (await db.GameResult.count({ where: { id: ctx.session.id } })) === 1, '판 기록 줄');
    await waitSignals(ctx, 'profile');
    const row = await db.GameResult.findOne({ where: { id: ctx.session.id }, raw: true });
    assert.equal(row.win_reason, 'MAINTENANCE');
    const rewardRows = await db.EconomyLedgerEntry.count({ where: { reference_event_id: rewardRef(ctx.session.id), reason: 'GAME_REWARD' } });
    assert.equal(rewardRows, 0);
    for (const u of ctx.session.players.keys()) assert.equal(await goldOf(u), before.get(u), `${u} 지갑 그대로`);
});

// ── A07-B-206~208: 지갑 = 장부 합 ──

test('A07-B-206 1판 뒤 → 사람마다 지갑 골드 = 장부 골드 합', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 5, label: 'g206' });
    finishJokerWin(ctx);
    await waitSignals(ctx);
    for (const u of ctx.session.players.keys()) {
        const { wallet } = await money.assertWalletMatchesLedger(u);
        assert.equal(wallet.gold, 1);
    }
});

test('A07-B-207 같은 5명이 3판 연달아 뒤 → 사람마다 지갑 골드 = 장부 골드 합', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers(5, 'g207');
    for (let round = 0; round < 3; round += 1) {
        const ctx = await startGame(t, { n: 5, label: 'g207', uuids });
        finishJokerWin(ctx);
        await waitSignals(ctx);
    }
    for (const u of uuids) {
        const { entries } = await money.assertWalletMatchesLedger(u);
        assert.equal(entries.filter((e) => e.reason === 'GAME_REWARD').length, 3, `${u} 판 골드 장부 3줄`);
    }
});

test('A07-B-208 업적 보상과 같은 판 뒤 → 사람마다 지갑 골드 = 장부 골드 합', async (t) => {
    if (noDb(t)) return;
    productionSource(t);
    const ctx = await startGame(t, { n: 5, label: 'g208' });
    const achiever = ctx.citizens[0];
    // 판 수 3 업적 기준−1 (옛 판 2판)
    await seedCompletedGames(achiever, 2);
    finishJokerWin(ctx, { spare: [achiever] });
    await waitSignals(ctx);
    const achievementRows = await db.EconomyLedgerEntry.count({ where: { user_id: achiever, reason: 'ACHIEVEMENT_REWARD' } });
    assert.ok(achievementRows >= 1, '업적 보상 장부 줄이 있어야 함');
    for (const u of ctx.session.players.keys()) await money.assertWalletMatchesLedger(u);
});

// ── A07-B-209~211: 잔액 끝 경계 (5명 판, 값 1) ──

const BALANCE_EDGES = [
    ['209', MAX_BALANCE - 2, '최대−2 → +1 받음', MAX_BALANCE - 1],
    ['210', MAX_BALANCE - 1, '최대−1 → 최대가 됨', MAX_BALANCE],
    ['211', MAX_BALANCE, '최대 → 그 사람만 빠지고 나머지 4명 받음', null],
];
for (const [no, start, label, expected] of BALANCE_EDGES) {
    test(`A07-B-${no} 5명 판 값 1 한 사람 잔액 ${label}`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { n: 5, label: `g${no}` });
        const rich = ctx.citizens[0];
        await money.fund(rich, 'GOLD', start);
        const before = await goldBefore(ctx.session.players.keys());
        assert.equal(before.get(rich), start);
        finishJokerWin(ctx);
        await waitSignals(ctx);
        if (expected === null) await assertNoGold(ctx.session.id, rich, start);
        else await assertGotGold(ctx.session.id, rich, start, 1);
        if (expected !== null) assert.equal(await goldOf(rich), expected);
        for (const u of ctx.session.players.keys()) {
            if (u !== rich) await assertGotGold(ctx.session.id, u, before.get(u), 1);
        }
    });
}

// ── A07-B-212~216 ──

test('A07-B-212 같은 5명이 두 판 연달아 → 사람마다 장부 2줄, 참조 id 다름, 지갑 +2', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers(5, 'g212');
    const gameIds = [];
    for (let round = 0; round < 2; round += 1) {
        const ctx = await startGame(t, { n: 5, label: 'g212', uuids });
        finishJokerWin(ctx);
        await waitSignals(ctx);
        gameIds.push(ctx.session.id);
    }
    for (const u of uuids) {
        const rows = await db.EconomyLedgerEntry.findAll({ where: { user_id: u, reason: 'GAME_REWARD' }, raw: true });
        assert.equal(rows.length, 2, `${u} 장부 줄 수`);
        assert.deepEqual(rows.map((r) => r.reference_event_id).sort(), gameIds.map(rewardRef).sort());
        assert.equal(await goldOf(u), 2);
    }
});

test('A07-B-213 5명 판 한 사람이 그 판에 업적 → 그 사람 장부 GAME_REWARD 1줄 + ACHIEVEMENT_REWARD 줄, 지갑 = 합', async (t) => {
    if (noDb(t)) return;
    productionSource(t);
    const ctx = await startGame(t, { n: 5, label: 'g213' });
    const achiever = ctx.citizens[0];
    await seedCompletedGames(achiever, 2);
    finishJokerWin(ctx, { spare: [achiever] });
    await waitSignals(ctx);
    const rows = await money.ledgerOf(achiever);
    assert.equal(rows.filter((r) => r.reason === 'GAME_REWARD').length, 1);
    assert.ok(rows.filter((r) => r.reason === 'ACHIEVEMENT_REWARD').length >= 1, '업적 보상 줄');
    await money.assertWalletMatchesLedger(achiever);
});

test('A07-B-214 8명 판 값 2 1명 탈주 → 판 끝 칸 goldReward와 장부 금액이 사람마다 같음 (탈주자 0·장부 없음)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 8, label: 'g214', gold: 2 });
    const deserter = ctx.citizens[0];
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, deserter, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishJokerWin(ctx);
    await waitSignals(ctx);
    // 판 끝 방송(밤 결과)에 실린 판 끝 칸을 남은 사람 소켓에서 읽음
    const watcher = ctx.jokers[0];
    const ended = ctx.world.received(watcher, 'night_result_applied').find((e) => e.payload?.winResult);
    assert.ok(ended, '판 끝 칸이 실린 밤 결과 알림');
    const reveals = ended.payload.winResult.reveals;
    assert.equal(reveals.length, 8);
    for (const r of reveals) {
        const rows = await goldRows(ctx.session.id, r.uuid);
        const paid = rows.reduce((sum, row) => sum + Number(row.amount), 0);
        assert.equal(r.goldReward, paid, `${r.uuid} 판 끝 칸 = 장부`);
        if (r.uuid === deserter) {
            assert.equal(r.goldReward, 0);
            assert.equal(rows.length, 0);
        } else {
            assert.equal(r.goldReward, 2);
        }
    }
});

test('A07-B-215 5명 판 1명 지갑 줄 없음 → 지갑 줄이 생기고 골드 1', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 5, label: 'g215' });
    const fresh = ctx.citizens[0];
    // 나머지 4명은 지갑 줄을 먼저 만들어 둠 (장부로 10골드), 한 명만 지갑 줄 없음
    for (const u of ctx.session.players.keys()) if (u !== fresh) await money.fund(u, 'GOLD', 10);
    assert.equal(await hasWallet(fresh), false, '시작 전 지갑 줄 없음');
    finishJokerWin(ctx);
    await waitSignals(ctx);
    assert.equal(await hasWallet(fresh), true);
    await assertGotGold(ctx.session.id, fresh, 0, 1);
});

test('A07-B-216 5명 판 전적 저장이 제약 위반으로 그만 → 장부 0줄', async (t) => {
    if (noDb(t)) return;
    // 한 사람은 계정 줄이 없는 uuid → 참가 기록 넣기가 제약 위반(다시 해도 같음)
    const ghost = crypto.randomUUID();
    const ctx = await startGame(t, { n: 5, label: 'g216', extraUuids: [ghost] });
    const before = await goldBefore(ctx.session.players.keys());
    finishJokerWin(ctx);
    // 저장 작업이 그만둘 때까지 + 첫 다시 하기(1초)보다 길게 기다린 뒤 봄
    await waitFor(() => recordService.__getTerminalPersistRunsForTests().length === 0, '저장 그만둠');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    assert.equal(await db.GameResult.count({ where: { id: ctx.session.id } }), 0, '전적 줄 없음');
    assert.equal(await db.EconomyLedgerEntry.count({ where: { reference_event_id: rewardRef(ctx.session.id) } }), 0);
    for (const u of ctx.session.players.keys()) if (u !== ghost) assert.equal(await goldOf(u), before.get(u));
});
