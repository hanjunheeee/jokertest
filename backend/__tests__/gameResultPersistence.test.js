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
        findAll: async ({ where, transaction }) => {
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
const stubPersistGameResult = (t, impl) => {
    const original = gameResultRepository.persistGameResult;
    const calls = [];
    gameResultRepository.persistGameResult = (session, options) => {
        calls.push({ session, options });
        return impl ? impl(session, options) : Promise.resolve({ persisted: true, gameId: session.id });
    };
    t.after(() => {
        gameResultRepository.persistGameResult = original;
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
    assert.equal(calls[0].session, session);
    assert.equal(calls[0].options.completed, true);
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
    assert.equal(calls[0].session, session);
    assert.equal(calls[0].options.completed, true);
});

test("AC-02/03: 같은 종료 세션의 중복 훅은 DB 멱등 함수에 그대로 위임한다", async (t) => {
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
    // 완주한 판은 마지막 참가자 이탈로 세션이 정리될 때 저장 훅을 다시 밟는다.
    finalizeGameSessionEnd(io, session, "PLAYER_LEFT", "u1");
    await flushAsync();

    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.session === session));
    assert.ok(calls.every((call) => call.options.completed === true));
});

test("AC-02: 끊김 사망으로 승패가 확정되면 결과 화면 이탈을 기다리지 않고 저장한다", async (t) => {
    withSocketLayer(t);
    const calls = stubPersistGameResult(t);
    const session = makeEndedSession({ phase: "DAY", winResult: undefined, endedAt: undefined });
    const victim = session.players.get("u3");
    victim.alive = true;
    victim.deathReason = null;
    const io = createFakeIo();

    const originals = {
        getDisconnectGraceTarget: gameSessionCore.getDisconnectGraceTarget,
        commitDisconnectElimination: gameSessionCore.commitDisconnectElimination,
    };
    gameSessionCore.getDisconnectGraceTarget = () => ({ session });
    gameSessionCore.commitDisconnectElimination = () => {
        victim.alive = false;
        victim.deathReason = "DISCONNECT";
        session.phase = "ENDED";
        session.winResult = { winner: "CITIZEN" };
        session.endedAt = 62_000;
        return { ok: true, victimUuid: "u3", terminal: { winner: "CITIZEN" } };
    };
    t.after(() => Object.assign(gameSessionCore, originals));

    const run = beginDisconnectGrace(io, session, "u3", {
        setTimeoutFn: () => null,
        clearTimeoutFn: () => {},
    });
    expireDisconnectGrace(run);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].session, session);
    assert.equal(calls[0].options.completed, true);
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
