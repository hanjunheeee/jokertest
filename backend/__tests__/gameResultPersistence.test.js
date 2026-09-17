// backend/models(→Sequelize)는 require 시점에 DATABASE_URL을 문자열로 파싱한다(연결을 실제로
// 시도하지는 않는다 — 이 파일은 db.* 를 전부 가짜로 교체한다). npm test(--env-file=.env.test)
// 밖에서 이 파일만 직접 실행하면 그 값이 비어 있어 require 자체가 죽으므로, 다른 스위트
// (auth.login.regression.test.js 등)와 같은 더미 폴백을 둔다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");

// 실제 DB 없이 저장 경로만 태웁니다. models는 require 캐시상 싱글턴이라 여기서 갈아끼운
// db.GameResult / db.GameResultPlayer / db.UserStats / db.sequelize.transaction을
// repositories가 그대로 씁니다(auth.signup.rollback.test.js와 같은 관례).
const db                   = require("../models");
const gameResultRepository = require("../repositories/gameResult.repositories");
const userRepository       = require("../repositories/user.repositories");
const profileController    = require("../controller/profile.controller");
const gameSessionCore      = require("../game-core/gameSession");
const gameSessionSocket    = require("../socket/gameSession");

const { buildGameResultRecord } = gameSessionCore;
const {
    beginDisconnectGrace,
    expireDisconnectGrace,
    finalizeGameSessionEnd,
    handleResolveNight,
    handleResolveTribunalVote,
    persistTerminalSession,
    __getTerminalPersistRunsForTests,
    __setTerminalPersistTimersForTests,
    __setEvaluateAchievementsForTests,
} = gameSessionSocket.__testables;

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const makePlayer = (uuid, role, alive = true, deathReason = null) => [uuid, {
    uuid,
    nickname: `nick-${uuid}`,
    role,
    team: role === "JOKER" ? "JOKER" : "CITIZEN",
    alive,
    deathReason,
}];

const makeEndedSession = (overrides = {}) => ({
    id: "game-1",
    roomId: "room-1",
    channelId: "room-1",
    phase: "ENDED",
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: 1_000,
    endedAt: 61_000,
    winResult: { winner: "CITIZEN" },
    players: new Map([
        makePlayer("u1", "CITIZEN"),
        makePlayer("u2", "DOCTOR"),
        makePlayer("u3", "JOKER", false, "ASSASSINATION"),
    ]),
    ...overrides,
});

// 승패가 확정되지 않은 채 참가자 이탈로 깨진 판.
const makeAbortedSession = (overrides = {}) => ({
    id: "game-abort-1",
    roomId: "room-abort-1",
    channelId: "room-abort-1",
    phase: "NIGHT",
    dayIndex: 1,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 },
    timerSettings: { dayDiscussionTime: null, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: 2_000,
    players: new Map([
        makePlayer("a1", "CITIZEN"),
        makePlayer("a2", "DOCTOR"),
        makePlayer("a3", "JOKER"),
    ]),
    ...overrides,
});

const createFakeIo = () => ({
    emitted: [],
    left: [],
    to(channelId) {
        const emitted = this.emitted;
        return { emit: (event, payload) => emitted.push({ channelId, event, payload }) };
    },
    in(channelId) {
        const left = this.left;
        return { socketsLeave: (room) => left.push({ channelId, room }) };
    },
});

const countingCallback = () => {
    const calls = [];
    return { callback: (payload) => calls.push(payload), calls };
};

// 마이크로태스크로 미뤄진 저장 호출이 끝날 때까지 기다립니다(저장은 await되지 않습니다).
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

// ── 가짜 DB ──────────────────────────────────────────────────────────────────

// 커밋된 테이블과 트랜잭션 안에서만 보이는 스테이징을 나눠 둡니다. 커밋에 도달하지 못하면
// 스테이징은 통째로 버려지므로 "롤백되어 남지 않았다"를 관찰할 수 있습니다.
const setupFakeDb = (t, { statsFails = false, duplicateRace = false } = {}) => {
    const original = {
        transaction:      db.sequelize.transaction,
        GameResult:       db.GameResult,
        GameResultPlayer: db.GameResultPlayer,
        UserStats:        db.UserStats,
        User:             db.User,
    };

    const committed = {
        game_results: [],
        game_result_players: [],
        role_history: new Map([["u1", ["DOCTOR", "DOCTOR"]]]),
        user_stats: new Map(),
    };
    const seenTransactions = [];
    let staged = null;

    const statsRow = (user_id, total_games = 0, survival_count = 0) => ({
        user_id, total_games, survival_count, execution_count: 0, most_played_role: null,
    });
    committed.user_stats.set("u1", statsRow("u1", 3, 1));
    committed.user_stats.set("u2", statsRow("u2"));
    committed.user_stats.set("u3", statsRow("u3"));
    committed.user_stats.set("a1", statsRow("a1"));
    committed.user_stats.set("a2", statsRow("a2"));
    committed.user_stats.set("a3", statsRow("a3"));

    db.sequelize.transaction = async (work) => {
        const tx = { id: `tx-${seenTransactions.length + 1}` };
        staged = { game_results: [], game_result_players: [], stats: [], statsUpdates: [] };
        try {
            const result = await work(tx);
            committed.game_results.push(...staged.game_results);
            committed.game_result_players.push(...staged.game_result_players);
            for (const player of staged.game_result_players) {
                const history = committed.role_history.get(player.user_id) ?? [];
                committed.role_history.set(player.user_id, [...history, player.role]);
            }
            for (const { user_id, delta } of staged.stats) {
                const row = committed.user_stats.get(user_id);
                if (!row) continue;
                for (const [key, amount] of Object.entries(delta)) row[key] += amount;
            }
            for (const { user_id, values } of staged.statsUpdates) {
                const row = committed.user_stats.get(user_id);
                if (row) Object.assign(row, values);
            }
            return result;
        } finally {
            staged = null;
        }
    };

    const requireTransaction = (options, label) => {
        assert.ok(staged, `${label}가 트랜잭션 밖에서 실행되었습니다`);
        assert.ok(options?.transaction, `${label}에 transaction 옵션이 전달되지 않았습니다`);
        seenTransactions.push(options.transaction);
    };

    db.GameResult = {
        findOrCreate: async ({ where, defaults, transaction }) => {
            requireTransaction({ transaction }, "findOrCreate(game_results)");
            if (duplicateRace) {
                const error = Object.create(db.Sequelize.UniqueConstraintError.prototype);
                error.fields = { id: where.id };
                error.parent = { constraint: "game_results_pkey" };
                throw error;
            }
            const existing = committed.game_results.find((row) => row.id === where.id);
            if (existing) return [existing, false];
            staged.game_results.push(defaults);
            return [defaults, true];
        },
        findOne: async () => null,
    };

    db.GameResultPlayer = {
        bulkCreate: async (rows, options) => {
            requireTransaction(options, "bulkCreate(game_result_players)");
            staged.game_result_players.push(...rows);
            return rows;
        },
        // F-10: roleStatistics 조회(gameResult.repositories.js의 findRoleStatisticsRows)는
        // include로 GameResult.settings를 함께 읽고, 트랜잭션 밖(커밋된 값만)에서 호출된다 —
        // most_played_role 갱신에 쓰는 트랜잭션 안쪽 role-history 조회와는 모양이 다르므로
        // include 유무로 분기한다.
        findAll: async ({ where, transaction, include }) => {
            if (include) {
                const gameById = new Map(committed.game_results.map((g) => [g.id, g]));
                return committed.game_result_players
                    .filter((row) => row.won !== null && row.won !== undefined)
                    .filter((row) => where.user_id === undefined || row.user_id === where.user_id)
                    .filter((row) => where.role === undefined || row.role === where.role)
                    .map((row) => ({
                        user_id: row.user_id,
                        role: row.role,
                        won: row.won,
                        is_alive: row.is_alive,
                        GameResult: { settings: gameById.get(row.game_id)?.settings ?? null },
                    }));
            }
            requireTransaction({ transaction }, "findAll(game_result_players roles)");
            const prior = committed.role_history.get(where.user_id) ?? [];
            const current = staged.game_result_players
                .filter((row) => row.user_id === where.user_id)
                .map((row) => row.role);
            return [...prior, ...current].map((role) => ({ role }));
        },
    };

    db.UserStats = {
        increment: async (delta, options) => {
            requireTransaction(options, "increment(user_stats)");
            if (statsFails) throw new Error("user_stats 증분 실패");
            staged.stats.push({ user_id: options.where.user_id, delta });
        },
        update: async (values, options) => {
            requireTransaction(options, "update(user_stats most_played_role)");
            staged.statsUpdates.push({ user_id: options.where.user_id, values });
            return [1];
        },
    };

    // 프로필 조회는 같은 in-memory user_stats를 읽습니다 — 커밋된 값이 그대로 보여야 합니다.
    db.User = {
        findOne: async ({ where }) => {
            const stats = committed.user_stats.get(where.uuid);
            if (!stats) return null;
            return { nickname: `nick-${where.uuid}`, profile_image_url: null, UserStat: { ...stats, reputation: 0, title: "신참" } };
        },
    };

    t.after(() => {
        db.sequelize.transaction = original.transaction;
        db.GameResult            = original.GameResult;
        db.GameResultPlayer      = original.GameResultPlayer;
        db.UserStats             = original.UserStats;
        db.User                  = original.User;
    });

    return { committed, seenTransactions };
};

// 소켓 계층이 부르는 저장소를 가로챕니다(모듈 객체를 그대로 참조하므로 속성 교체로 충분합니다).
//
// F-21(A-09): 소켓 계층이 부르는 경계가 persistGameResult(살아 있는 session)에서
// persistGameResultRecord(**이미 조립된 불변 레코드**)로 옮겨졌다. 재시도가 같은 값을 다시
// 쓴다는 것을 보장하려면 저장소가 session을 다시 읽어서는 안 되기 때문이다. 이 대역도 같은
// 경계를 가로채므로, 아래 단언들은 "무엇이 저장되는가"를 레코드에서 직접 읽는다.
const stubPersistGameResult = (t, impl) => {
    const original = gameResultRepository.persistGameResultRecord;
    const calls = [];
    gameResultRepository.persistGameResultRecord = (record) => {
        calls.push({ record });
        return impl ? impl(record) : Promise.resolve({ persisted: true, gameId: record.result.id });
    };
    t.after(() => {
        gameResultRepository.persistGameResultRecord = original;
    });
    return calls;
};

// 컨트롤러를 fake req/res로 직접 태워 실제 응답 본문을 읽습니다.
const readProfile = async (uuid) => {
    let captured;
    const res = {
        status(code) {
            this.code = code;
            return this;
        },
        json(payload) {
            captured = payload;
            return this;
        },
    };
    await profileController.getMyProfile({ user: { uuid } }, res, (err) => {
        throw err;
    });
    // 리포지토리를 거쳐 읽는지도 함께 확인한다(컨트롤러가 db를 직접 읽지 않는다).
    assert.ok(await userRepository.getMyProfile(uuid));
    return captured;
};

// ── AC-01 ────────────────────────────────────────────────────────────────────

test("AC-01: game_results·game_result_players·user_stats가 단일 트랜잭션으로 저장된다", async (t) => {
    const { committed, seenTransactions } = setupFakeDb(t);
    const session = makeEndedSession();

    const outcome = await gameResultRepository.persistGameResult(session, { completed: true });

    assert.deepEqual(outcome, { persisted: true, gameId: "game-1" });
    assert.equal(committed.game_results.length, 1);
    assert.equal(committed.game_result_players.length, 3);
    // 세 테이블에 대한 모든 쓰기가 같은 트랜잭션 객체를 받았다.
    assert.ok(seenTransactions.length >= 5);
    assert.equal(new Set(seenTransactions.map((tx) => tx.id)).size, 1);
});

test("AC-01: 저장 실패는 세 테이블 어디에도 흔적을 남기지 않는다(단일 트랜잭션 롤백)", async (t) => {
    const { committed } = setupFakeDb(t, { statsFails: true });

    await assert.rejects(
        () => gameResultRepository.persistGameResult(makeEndedSession(), { completed: true }),
        /user_stats 증분 실패/,
    );

    assert.deepEqual(committed.game_results, []);
    assert.deepEqual(committed.game_result_players, []);
    assert.equal(committed.user_stats.get("u1").total_games, 3);
});

test("AC-01: 저장 후 프로필 조회에 stats 변경이 반영된다", async (t) => {
    const { committed } = setupFakeDb(t);

    await gameResultRepository.persistGameResult(makeEndedSession(), { completed: true });

    assert.equal(committed.user_stats.get("u1").total_games, 4);
    assert.equal(committed.user_stats.get("u1").survival_count, 2);
    assert.equal(committed.user_stats.get("u1").most_played_role, "DOCTOR");

    const body = await readProfile("u1");
    assert.equal(body.success, true);
    assert.equal(body.data.total_games, 4);
    assert.equal(body.data.survival_count, 2);
    assert.equal(body.data.most_played_role, "DOCTOR");
});

// ── AC-02 ────────────────────────────────────────────────────────────────────

const withSocketLayer = (t) => {
    gameSessionSocket.__resetStateForTests();
    gameSessionSocket.setOnlineUsersRegistry(new Map([["u1", "socket-1"]]));
    t.after(() => {
        gameSessionSocket.__resetStateForTests();
    });
};

test("AC-02: 밤 판정 종료 경로에서 저장이 정확히 1회 일어난다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession();
    const io = createFakeIo();
    const socket = { id: "socket-1", data: { user: { uuid: "u1" } }, emit: () => {} };
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, privateResults: new Map(), publicDeathReveals: [] } }),
        commit: () => ({ ok: true, victimUuid: "u3", terminal: { winner: "CITIZEN" } }),
        resolveParticipantSockets: () => [socket],
    };

    handleResolveNight(io, socket, "u1", { gameId: session.id }, countingCallback().callback, deps);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].record.result.id, session.id);
    assert.equal(calls[0].record.result.completed, true);
});

test("AC-02: 종결되지 않은 밤 판정은 저장하지 않는다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession({ phase: "DAY", dayPhase: "DAY_DISCUSSION", winResult: undefined, endedAt: undefined });
    const io = createFakeIo();
    const socket = { id: "socket-1", data: { user: { uuid: "u1" } }, emit: () => {} };
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, privateResults: new Map(), publicDeathReveals: [] } }),
        commit: () => ({ ok: true, victimUuid: "u3", terminal: null }),
        resolveParticipantSockets: () => [socket],
    };

    handleResolveNight(io, socket, "u1", { gameId: session.id }, countingCallback().callback, deps);
    await flushAsync();

    assert.equal(calls.length, 0);
});

test("AC-02: 재판 판정 종료 경로에서 저장이 정확히 1회 일어난다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession({
        tribunal: { dayIndex: 2, defendantUuid: "u3", outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "u3", resolved: true },
    });
    const io = createFakeIo();
    const socket = { id: "socket-1", data: { user: { uuid: "u1" } }, emit: () => {} };
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, defendantUuid: "u3", outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "u3" } }),
        commit: () => ({ ok: true, terminal: { winner: "CITIZEN" } }),
        resolveParticipantSockets: () => [socket],
    };

    handleResolveTribunalVote(io, socket, "u1", { gameId: session.id, dayIndex: 2 }, countingCallback().callback, deps);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].record.result.id, session.id);
    assert.equal(calls[0].record.result.completed, true);
});

test("AC-02/03(F-21 A-09): 같은 종료 세션의 중복 훅은 두 번째 저장 작업을 만들지 않는다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession();
    const io = createFakeIo();
    const socket = { id: "socket-1", data: { user: { uuid: "u1" } }, emit: () => {} };
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, privateResults: new Map(), publicDeathReveals: [] } }),
        commit: () => ({ ok: true, victimUuid: "u3", terminal: { winner: "CITIZEN" } }),
        resolveParticipantSockets: () => [socket],
    };

    handleResolveNight(io, socket, "u1", { gameId: session.id }, countingCallback().callback, deps);
    // 완주한 판은 마지막 참가자 이탈로 세션이 정리될 때 저장 훅을 다시 밟는다. 예전에는 그
    // 두 번째 훅이 곧바로 두 번째 저장을 시작하고 DB PK의 멱등성에 기댔다.
    //
    // F-21(A-09): 이제 gameId당 작업은 하나뿐이다. 두 번째 훅은 진행 중인 작업을 보고 조용히
    // 돌아간다 — 그래야 두 개의 재시도 타이머가 같은 레코드를 향해 따로 돌지 않는다. DB
    // 멱등성 자체는 여전히 game_results PK가 보장하며, 그 계약은 아래 AC-03 시험이 저장소를
    // 직접 두 번 호출해 확인한다.
    finalizeGameSessionEnd(io, session, "PLAYER_LEFT", "u1");
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].record.result.id, session.id);
    assert.equal(calls[0].record.result.completed, true);
});

test("AC-02: 끊김 사망으로 승패가 확정되면 결과 화면 이탈을 기다리지 않고 저장한다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession({ phase: "DAY", winResult: undefined, endedAt: undefined });
    const victim = session.players.get("u3");
    victim.alive = true;
    victim.deathReason = null;
    const io = createFakeIo();

    // F-21(AC-03): 유예 만료도 추방·명시적 이탈과 **같은 경계**(commitParticipantDeparture)를
    // 지난다. 이 시험이 고정하려는 것은 "종결이 확정되면 결과 화면 이탈을 기다리지 않고
    // 저장한다"이므로, 대역도 그 경계에 맞춘다.
    const originals = {
        getDisconnectGraceTarget: gameSessionCore.getDisconnectGraceTarget,
        commitParticipantDeparture: gameSessionCore.commitParticipantDeparture,
    };
    gameSessionCore.getDisconnectGraceTarget = () => ({ session });
    gameSessionCore.commitParticipantDeparture = () => {
        victim.alive = false;
        victim.deathReason = "DISCONNECT";
        victim.isParticipating = false;
        session.phase = "ENDED";
        session.winResult = { winner: "CITIZEN" };
        session.endedAt = 62_000;
        return {
            ok: true,
            victimUuid: "u3",
            eliminated: true,
            terminal: { winner: "CITIZEN" },
            tribunalCancelled: false,
        };
    };
    t.after(() => Object.assign(gameSessionCore, originals));

    const run = beginDisconnectGrace(io, session, "u3", {
        setTimeoutFn: () => null,
        clearTimeoutFn: () => {},
    });
    expireDisconnectGrace(run);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].record.result.id, session.id);
    assert.equal(calls[0].record.result.completed, true);
});

// ── AC-03 ────────────────────────────────────────────────────────────────────

test("AC-03: 같은 game_id로 두 번 호출해도 행이 중복되지 않고 stats도 두 번 더해지지 않는다", async (t) => {
    const { committed } = setupFakeDb(t);
    const session = makeEndedSession();

    const first  = await gameResultRepository.persistGameResult(session, { completed: true });
    const second = await gameResultRepository.persistGameResult(session, { completed: true });

    assert.deepEqual(first,  { persisted: true,  gameId: "game-1" });
    assert.deepEqual(second, { persisted: false, gameId: "game-1" });
    assert.equal(committed.game_results.length, 1);
    assert.equal(committed.game_result_players.length, 3);
    assert.equal(committed.user_stats.get("u1").total_games, 4);
});

test("AC-03: 동시 삽입 경쟁의 game_results PK 충돌도 성공한 no-op으로 처리한다", async (t) => {
    const { committed } = setupFakeDb(t, { duplicateRace: true });

    const outcome = await gameResultRepository.persistGameResult(makeEndedSession(), { completed: true });

    assert.deepEqual(outcome, { persisted: false, gameId: "game-1" });
    assert.equal(committed.game_result_players.length, 0);
    assert.equal(committed.user_stats.get("u1").total_games, 3);
});

// ── AC-04 ────────────────────────────────────────────────────────────────────

test("AC-04: 중단 경기는 completed=false이고 이탈자만 패배·DISCONNECT로 기록된다", () => {
    const record = buildGameResultRecord(makeAbortedSession(), { completed: false, disconnectedUuid: "a3" });

    assert.equal(record.result.completed, false);
    assert.equal(record.result.winner, "NONE");
    assert.equal(record.result.win_reason, "ABORTED");

    const leaver = record.players.find((p) => p.user_id === "a3");
    assert.equal(leaver.won, false);
    assert.equal(leaver.is_alive, false);
    assert.equal(leaver.death_reason, "DISCONNECT");

    for (const uuid of ["a1", "a2"]) {
        const stayer = record.players.find((p) => p.user_id === uuid);
        assert.equal(stayer.won, null, `${uuid}의 승패는 미확정이어야 한다`);
        assert.equal(stayer.is_alive, true);
        assert.equal(stayer.death_reason, null);
    }

    // stats는 이탈자에게만 만들어진다 — 잔류자의 전적은 이 판으로 변하지 않는다.
    assert.deepEqual(record.stats, [{ user_id: "a3", total_games: 1, survival_count: 0, execution_count: 0 }]);
});

test("AC-04: 중단 경기 저장 후에도 잔류자의 stats는 그대로다", async (t) => {
    const { committed } = setupFakeDb(t);

    await gameResultRepository.persistGameResult(makeAbortedSession(), {
        completed: false,
        disconnectedUuid: "a3",
    });

    assert.equal(committed.user_stats.get("a3").total_games, 1);
    assert.equal(committed.user_stats.get("a1").total_games, 0);
    assert.equal(committed.user_stats.get("a2").total_games, 0);
});

test("AC-04: 끊김 사망으로 자연 승패가 확정된 판은 completed=true로 기록된다", () => {
    const session = makeEndedSession();
    session.players.get("u3").deathReason = "DISCONNECT";

    const record = buildGameResultRecord(session, { completed: true });
    const disconnected = record.players.find((p) => p.user_id === "u3");

    assert.equal(record.result.completed, true);
    assert.equal(disconnected.death_reason, "DISCONNECT");
    assert.equal(disconnected.won, false);
    assert.equal(record.stats.length, 3);
});

test("AC-04: 완주한 판에서 나가는 것은 이탈이 아니다(생존 승자가 그대로 남는다)", () => {
    const record = buildGameResultRecord(makeEndedSession(), { completed: true, disconnectedUuid: "u1" });

    const winner = record.players.find((p) => p.user_id === "u1");
    assert.equal(record.result.completed, true);
    assert.equal(winner.won, true);
    assert.equal(winner.is_alive, true);
    assert.equal(winner.death_reason, null);
});

test("AC-07: 결과 헤더와 참가자 필드 및 사망 사유 문자열을 정확히 채운다", () => {
    const session = makeEndedSession();
    const executed = session.players.get("u2");
    executed.alive = false;
    executed.deathReason = "EXECUTION";

    const record = buildGameResultRecord(session, { completed: true });

    assert.deepEqual(Object.keys(record.result).sort(), [
        "completed", "day_index", "ended_at", "id", "player_count", "room_id",
        "settings", "started_at", "win_reason", "winner",
    ]);
    assert.deepEqual(Object.keys(record.players[0]).sort(), [
        "death_reason", "game_id", "is_alive", "nickname_snapshot", "role",
        "team", "user_id", "won",
    ]);
    assert.equal(record.players.find((p) => p.user_id === "u2").death_reason, "EXECUTION");
    assert.equal(record.players.find((p) => p.user_id === "u3").death_reason, "ASSASSINATION");
    assert.equal(record.stats.find((s) => s.user_id === "u2").execution_count, 1);
});

// ── AC-05 ────────────────────────────────────────────────────────────────────

test("AC-05: DB 저장이 실패해도 game_ended 방송과 registry 정리는 그대로 진행된다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t, () => {
        throw new Error("DB 다운");
    });
    const session = makeAbortedSession();
    const io = createFakeIo();

    finalizeGameSessionEnd(io, session, "PLAYER_LEFT", "a3");
    await flushAsync();

    assert.equal(calls.length, 1);
    const ended = io.emitted.filter((e) => e.event === "game_ended");
    assert.equal(ended.length, 1);
    assert.deepEqual(ended[0].payload, { gameId: session.id, reason: "PLAYER_LEFT" });
    assert.deepEqual(io.left, [{ channelId: session.channelId, room: session.channelId }]);
});

test("AC-05: 저장 훅이 동기적으로 던져도 종료 처리는 멈추지 않는다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t, () => {
        throw new Error("레코드 조립 실패");
    });
    const io = createFakeIo();

    finalizeGameSessionEnd(io, makeAbortedSession(), "PARTICIPANT_LEFT", "a3");
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(io.emitted.filter((e) => e.event === "game_ended").length, 1);
});

test("AC-05: 밤 판정 저장이 실패해도 night_result_applied 방송은 나간다", async (t) => {
    withSocketLayer(t);
    stubPersistGameResult(t, () => {
        throw new Error("DB 다운");
    });
    const session = makeEndedSession();
    const io = createFakeIo();
    const emitted = [];
    const socket = { id: "socket-1", data: { user: { uuid: "u1" } }, emit: (event, payload) => emitted.push({ event, payload }) };
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, privateResults: new Map(), publicDeathReveals: [] } }),
        commit: () => ({ ok: true, victimUuid: "u3", terminal: { winner: "CITIZEN" } }),
        resolveParticipantSockets: () => [socket],
    };
    const { callback, calls } = countingCallback();

    handleResolveNight(io, socket, "u1", { gameId: session.id }, callback, deps);
    await flushAsync();

    assert.deepEqual(calls, [{ ok: true }]);
    const applied = emitted.filter((e) => e.event === "night_result_applied");
    assert.equal(applied.length, 1);
    assert.equal(applied[0].payload.phase, "ENDED");
    assert.deepEqual(applied[0].payload.winResult, { winner: "CITIZEN" });
});

// ── F-21 A-09/A-10: 불변 레코드·단일 재시도·커밋 후 개인 무효화 ────────────────

/** 실제 1/5/30/60초를 기다리지 않도록 예약된 콜백만 모으는 수동 시계. */
const useManualPersistTimers = (t) => {
    const scheduled = [];
    let seq = 0;
    __setTerminalPersistTimersForTests({
        setTimeoutFn: (fn, delay) => {
            seq += 1;
            scheduled.push({ id: seq, fn, delay });
            return seq;
        },
        clearTimeoutFn: (id) => {
            const index = scheduled.findIndex((entry) => entry.id === id);
            if (index >= 0) scheduled.splice(index, 1);
        },
    });
    t.after(() => __setTerminalPersistTimersForTests());
    return {
        scheduled,
        /** 가장 최근에 예약된 재시도를 발화시킨다. */
        fire() {
            const next = scheduled.shift();
            assert.ok(next, "예약된 재시도가 없다");
            next.fn();
            return next;
        },
    };
};

test("F-21 A-09: 첫 저장이 실패하면 **같은 레코드**로 1초 뒤 한 번만 재시도하고, 그 사이 세션이 정리돼도 ended_at·roster는 변하지 않는다", async (t) => {
    withSocketLayer(t);
    const timers = useManualPersistTimers(t);

    let failNext = true;
    const calls = stubPersistGameResult(t, (record) => {
        if (failNext) {
            failNext = false;
            return Promise.reject(new Error("DB 다운"));
        }
        return Promise.resolve({ persisted: true, gameId: record.result.id });
    });

    const session = makeEndedSession();
    persistTerminalSession(session, { completed: true });
    await flushAsync();

    // 1) 첫 시도는 실패했고, 작업은 사라지지 않았다 — 실패한 판이 아무도 다시 쓰지 않는
    //    미저장 상태로 남으면 안 된다.
    assert.equal(calls.length, 1);
    assert.equal(__getTerminalPersistRunsForTests().length, 1);
    assert.equal(timers.scheduled.length, 1);
    assert.equal(timers.scheduled[0].delay, 1_000);

    // 2) 저장을 기다리는 동안 세션이 정리되고 같은 방에서 새 판이 시작된 상황을 재현한다.
    //    레코드가 session을 다시 읽는다면 여기서 값이 무너진다.
    const endedAtBefore = calls[0].record.result.ended_at.getTime();
    const playerCountBefore = calls[0].record.result.player_count;
    session.players.clear();
    session.endedAt = 999_999;
    session.dayIndex = 99;
    session.winResult = { winner: "JOKER" };

    timers.fire();
    await flushAsync();

    // 3) 재시도는 **문자 그대로 같은 객체**를 다시 쓴다.
    assert.equal(calls.length, 2);
    assert.equal(calls[1].record, calls[0].record);
    assert.equal(calls[1].record.result.ended_at.getTime(), endedAtBefore);
    assert.equal(calls[1].record.result.player_count, playerCountBefore);
    assert.equal(calls[1].record.result.winner, "CITIZEN");
    assert.equal(calls[1].record.players.length, 3);

    // 4) 커밋을 확인했으므로 작업도 타이머도 남지 않는다.
    assert.equal(__getTerminalPersistRunsForTests().length, 0);
    assert.equal(timers.scheduled.length, 0);

    // 5) 뒤늦은 중복 종료 훅은 새 저장을 만들지 않는다.
    persistTerminalSession(session, { completed: true });
    await flushAsync();
    assert.equal(calls.length, 3, "성공 후의 새 훅은 새 작업을 만든다(pending이 비었으므로)");
    assert.equal(calls[2].record.result.id, session.id);
});

test("F-21 A-09: 재시도 간격은 1초→5초→30초→60초로 늘고 실패 중에는 pending을 지우지 않는다", async (t) => {
    withSocketLayer(t);
    const timers = useManualPersistTimers(t);
    stubPersistGameResult(t, () => Promise.reject(new Error("DB 다운")));

    persistTerminalSession(makeEndedSession(), { completed: true });
    await flushAsync();

    const observed = [timers.scheduled[0].delay];
    for (let i = 0; i < 4; i += 1) {
        timers.fire();
        await flushAsync();
        // 실패가 이어지는 동안에도 작업은 정확히 하나 — 타이머가 갈라지지 않는다.
        assert.equal(__getTerminalPersistRunsForTests().length, 1);
        assert.equal(timers.scheduled.length, 1);
        observed.push(timers.scheduled[0].delay);
    }

    assert.deepEqual(observed, [1_000, 5_000, 30_000, 60_000, 60_000]);
});

test("F-21 A-09/A-10: 업적 평가와 개인 캐시 무효화는 **DB 커밋을 확인한 뒤에만** 일어난다", async (t) => {
    withSocketLayer(t);
    const timers = useManualPersistTimers(t);

    const evaluated = [];
    __setEvaluateAchievementsForTests(async (userId) => { evaluated.push(userId); });
    t.after(() => __setEvaluateAchievementsForTests());

    const invalidations = [];
    gameSessionSocket.setEmitToUser((uuid, event, payload) => invalidations.push({ uuid, event, payload }));

    let failNext = true;
    stubPersistGameResult(t, (record) => {
        if (failNext) {
            failNext = false;
            return Promise.reject(new Error("DB 다운"));
        }
        return Promise.resolve({ persisted: true, gameId: record.result.id });
    });

    const session = makeEndedSession();
    persistTerminalSession(session, { completed: true });
    await flushAsync();

    // 실패한 저장은 업적도 무효화도 만들지 않는다 — DB에 없는 경기의 지급을 평가할 수 없다.
    assert.deepEqual(evaluated, []);
    assert.deepEqual(invalidations, []);

    timers.fire();
    await flushAsync();

    // 원 참가자 전원이 대상이다(현재 경기 채널 가입 여부는 조건이 아니다).
    assert.deepEqual(evaluated.sort(), ["u1", "u2", "u3"]);

    assert.ok(invalidations.length > 0);
    assert.ok(invalidations.every((entry) => entry.event === "account_cache_invalidated"));
    // 전적 무효화가 먼저, 업적 평가가 끝난 뒤의 경제·업적 무효화가 나중이다.
    const profileFirst = invalidations.slice(0, 3);
    assert.deepEqual(profileFirst.map((e) => e.uuid).sort(), ["u1", "u2", "u3"]);
    assert.ok(profileFirst.every((e) => e.payload.scopes.includes("profile")));
    const later = invalidations.slice(3);
    assert.deepEqual(later.map((e) => e.uuid).sort(), ["u1", "u2", "u3"]);
    assert.ok(later.every((e) => e.payload.scopes.includes("economy") && e.payload.scopes.includes("achievements")));

    // payload에는 gameId와 무효화 종류만 담긴다 — 역할·진영·승패는 이 신호로 새어나가지 않는다.
    for (const entry of invalidations) {
        assert.deepEqual(Object.keys(entry.payload).sort(), ["gameId", "scopes"]);
        assert.equal(entry.payload.gameId, session.id);
        const serialized = JSON.stringify(entry.payload);
        for (const secret of ["JOKER", "CITIZEN", "winner", "role", "team", "won"]) {
            assert.equal(serialized.includes(secret), false, `${secret}가 무효화 payload에 실렸다`);
        }
    }
});
