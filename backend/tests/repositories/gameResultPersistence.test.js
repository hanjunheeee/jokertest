process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test   = require("node:test");
const assert = require("node:assert/strict");

const db                   = require("../../models");
const gameResultRepository = require("../../repositories/gameResult.repositories");
const userRepository       = require("../../repositories/user.repositories");
const profileController    = require("../../controller/profile.controller");
const gameSessionCore      = require("../../game-core/gameSession");
const gameSessionSocket    = require("../../socket/gameSession");

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

const makeMemberSocket = (uuid, channelId, id = `socket-${uuid}`) => {
    const rooms = new Set([channelId]);
    const socket = {
        id,
        data: { user: { uuid } },
        connected: true,
        rooms,
        received: [],
        left: [],
        emit(event, payload) { socket.received.push({ event, payload }); },
        join(room) { rooms.add(room); },
        leave(room) { rooms.delete(room); socket.left.push(room); },
    };
    return socket;
};

const receivedCount = (socket, event) => socket.received.filter((e) => e.event === event).length;

const createFakeIo = (members = []) => {
    const sockets = new Map(members.map((m) => [m.id, m]));
    for (const m of members) m.nsp = { sockets };
    return {
        emitted: [],
        left: [],
        sockets: { sockets },
        to(channelId) {
            const emitted = this.emitted;
            return { emit: (event, payload) => emitted.push({ channelId, event, payload }) };
        },
        in(channelId) {
            const left = this.left;
            return { socketsLeave: (room) => left.push({ channelId, room }) };
        },
    };
};

const countingCallback = () => {
    const calls = [];
    return { callback: (payload) => calls.push(payload), calls };
};

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

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
    assert.ok(await userRepository.getMyProfile(uuid));
    return captured;
};

test("AC-01: game_results·game_result_players·user_stats가 단일 트랜잭션으로 저장된다", async (t) => {
    const { committed, seenTransactions } = setupFakeDb(t);
    const session = makeEndedSession();

    const outcome = await gameResultRepository.persistGameResult(session, { completed: true });

    assert.deepEqual(outcome, { persisted: true, gameId: "game-1" });
    assert.equal(committed.game_results.length, 1);
    assert.equal(committed.game_result_players.length, 3);
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

    await gameResultRepository.persistGameResult(
        makeEndedSession({ gameSource: "production" }),
        { completed: true },
    );

    assert.equal(committed.user_stats.get("u1").total_games, 4);
    assert.equal(committed.user_stats.get("u1").survival_count, 2);
    assert.equal(committed.user_stats.get("u1").most_played_role, "DOCTOR");

    const body = await readProfile("u1");
    assert.equal(body.success, true);
    assert.equal(body.data.total_games, 1);
    assert.equal(body.data.account_win_rate, 1, "시민 승리 한 판이면 계정 승률은 1이다");
    assert.equal(body.data.survival_count, 2);
    assert.equal(body.data.most_played_role, "DOCTOR");
    assert.equal(Object.hasOwn(body.data, "reputation"), false, "F-30 AC-04: 명성은 응답에서 제거됐다");

    const snapshot = {
        games: committed.game_results.length,
        players: committed.game_result_players.length,
        stats: { ...committed.user_stats.get("u1") },
    };
    const again = await readProfile("u1");
    assert.deepEqual(again.data, body.data);
    assert.deepEqual({
        games: committed.game_results.length,
        players: committed.game_result_players.length,
        stats: { ...committed.user_stats.get("u1") },
    }, snapshot, "프로필 조회가 저장 상태를 건드렸다");
});

const withSocketLayer = (t, members = []) => {
    gameSessionSocket.__resetStateForTests();
    const registry = new Map([["u1", "socket-1"]]);
    for (const m of members) registry.set(m.data.user.uuid, m.id);
    gameSessionSocket.setOnlineUsersRegistry(registry);
    __setEvaluateAchievementsForTests(async () => {});
    t.after(() => {
        gameSessionSocket.__resetStateForTests();
        __setEvaluateAchievementsForTests();
    });
};

test("AC-02: 밤 판정 종료 경로에서 저장이 정확히 1회 일어난다", async (t) => {
    const session = makeEndedSession();
    const socket = makeMemberSocket("u1", session.channelId, "socket-1");
    withSocketLayer(t, [socket]);
    const calls = stubPersistGameResult(t);
    const io = createFakeIo([socket]);
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
    const socket = makeMemberSocket("u1", session.channelId, "socket-1");
    const io = createFakeIo([socket]);
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
    const session = makeEndedSession({
        tribunal: { dayIndex: 2, defendantUuid: "u3", outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "u3", resolved: true },
    });
    const socket = makeMemberSocket("u1", session.channelId, "socket-1");
    withSocketLayer(t, [socket]);
    const calls = stubPersistGameResult(t);
    const io = createFakeIo([socket]);
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
    const session = makeEndedSession();
    const socket = makeMemberSocket("u1", session.channelId, "socket-1");
    withSocketLayer(t, [socket]);
    const calls = stubPersistGameResult(t);
    const io = createFakeIo([socket]);
    const deps = {
        prepare: () => ({ ok: true, session, resolution: { dayIndex: 2, privateResults: new Map(), publicDeathReveals: [] } }),
        commit: () => ({ ok: true, victimUuid: "u3", terminal: { winner: "CITIZEN" } }),
        resolveParticipantSockets: () => [socket],
    };

    handleResolveNight(io, socket, "u1", { gameId: session.id }, countingCallback().callback, deps);
    finalizeGameSessionEnd(io, session, "PLAYER_LEFT", "u1", ["u1", "u2", "u3"]);
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

test("AC-05: DB 저장이 실패해도 game_ended 방송과 registry 정리는 그대로 진행된다", async (t) => {
    const session = makeAbortedSession();
    const a1 = makeMemberSocket("a1", session.channelId);
    const a2 = makeMemberSocket("a2", session.channelId);
    const a3 = makeMemberSocket("a3", session.channelId);
    withSocketLayer(t, [a1, a2, a3]);
    const calls = stubPersistGameResult(t, () => {
        throw new Error("DB 다운");
    });
    const io = createFakeIo([a1, a2, a3]);

    finalizeGameSessionEnd(io, session, "PLAYER_LEFT", "a3", ["a1", "a2", "a3"]);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(receivedCount(a1, "game_ended"), 1);
    assert.equal(receivedCount(a2, "game_ended"), 1);
    assert.deepEqual(a1.received[0].payload, { gameId: session.id, reason: "PLAYER_LEFT" });
    assert.equal(receivedCount(a3, "game_ended"), 0);
    assert.equal(a1.rooms.has(session.channelId), false);
    assert.equal(a2.rooms.has(session.channelId), false);
});

test("AC-05: 저장 훅이 동기적으로 던져도 종료 처리는 멈추지 않는다", async (t) => {
    const session = makeAbortedSession();
    const a1 = makeMemberSocket("a1", session.channelId);
    const a2 = makeMemberSocket("a2", session.channelId);
    withSocketLayer(t, [a1, a2]);
    const calls = stubPersistGameResult(t, () => {
        throw new Error("레코드 조립 실패");
    });
    const io = createFakeIo([a1, a2]);

    finalizeGameSessionEnd(io, session, "PARTICIPANT_LEFT", "a3", ["a1", "a2", "a3"]);
    await flushAsync();

    assert.equal(calls.length, 1);
    assert.equal(receivedCount(a1, "game_ended"), 1);
    assert.equal(receivedCount(a2, "game_ended"), 1);
});

test("AC-05: 밤 판정 저장이 실패해도 night_result_applied 방송은 나간다", async (t) => {
    withSocketLayer(t);
    stubPersistGameResult(t, () => {
        throw new Error("DB 다운");
    });
    const session = makeEndedSession();
    const socket = makeMemberSocket("u1", session.channelId, "socket-1");
    const io = createFakeIo([socket]);
    const emitted = socket.received;
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
    assert.equal(applied[0].payload.winResult.winner, "CITIZEN");
    assert.ok(Array.isArray(applied[0].payload.winResult.reveals), "공개 winResult에는 전원 정체 공개(reveals)가 실린다");
});

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

    assert.equal(calls.length, 1);
    assert.equal(__getTerminalPersistRunsForTests().length, 1);
    assert.equal(timers.scheduled.length, 1);
    assert.equal(timers.scheduled[0].delay, 1_000);

    const endedAtBefore = calls[0].record.result.ended_at.getTime();
    const playerCountBefore = calls[0].record.result.player_count;
    session.players.clear();
    session.endedAt = 999_999;
    session.dayIndex = 99;
    session.winResult = { winner: "JOKER" };

    timers.fire();
    await flushAsync();

    assert.equal(calls.length, 2);
    assert.equal(calls[1].record, calls[0].record);
    assert.equal(calls[1].record.result.ended_at.getTime(), endedAtBefore);
    assert.equal(calls[1].record.result.player_count, playerCountBefore);
    assert.equal(calls[1].record.result.winner, "CITIZEN");
    assert.equal(calls[1].record.players.length, 3);

    assert.equal(__getTerminalPersistRunsForTests().length, 0);
    assert.equal(timers.scheduled.length, 0);

    persistTerminalSession(session, { completed: true });
    await flushAsync();
    assert.equal(calls.length, 2, "커밋을 확인한 판의 레코드를 다시 조립했다");
    assert.equal(__getTerminalPersistRunsForTests().length, 0);
    assert.equal(timers.scheduled.length, 0);
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

    assert.deepEqual(evaluated, []);
    assert.deepEqual(invalidations, []);

    timers.fire();
    await flushAsync();

    assert.deepEqual(evaluated.sort(), ["u1", "u2", "u3"]);

    assert.ok(invalidations.length > 0);
    assert.ok(invalidations.every((entry) => entry.event === "account_cache_invalidated"));
    const profileFirst = invalidations.slice(0, 3);
    assert.deepEqual(profileFirst.map((e) => e.uuid).sort(), ["u1", "u2", "u3"]);
    assert.ok(profileFirst.every((e) => e.payload.scopes.includes("profile")));
    const later = invalidations.slice(3);
    assert.deepEqual(later.map((e) => e.uuid).sort(), ["u1", "u2", "u3"]);
    assert.ok(later.every((e) => e.payload.scopes.includes("economy") && e.payload.scopes.includes("achievements")));

    for (const entry of invalidations) {
        assert.deepEqual(Object.keys(entry.payload).sort(), ["gameId", "scopes"]);
        assert.equal(entry.payload.gameId, session.id);
        const serialized = JSON.stringify(entry.payload);
        for (const secret of ["JOKER", "CITIZEN", "winner", "role", "team", "won"]) {
            assert.equal(serialized.includes(secret), false, `${secret}가 무효화 payload에 실렸다`);
        }
    }
});

test("F-21 A-09: pending 항목이 비는 시점과 업적 평가가 끝나는 시점은 다르다", async (t) => {
    withSocketLayer(t);

    let releaseEvaluation;
    const evaluationGate = new Promise((resolve) => { releaseEvaluation = resolve; });
    const pendingWhenEvaluationStarted = [];
    __setEvaluateAchievementsForTests(async (userId) => {
        pendingWhenEvaluationStarted.push(__getTerminalPersistRunsForTests().length);
        await evaluationGate;
        return userId;
    });
    t.after(() => {
        releaseEvaluation();
        __setEvaluateAchievementsForTests();
    });

    const invalidations = [];
    gameSessionSocket.setEmitToUser((uuid, event, payload) => invalidations.push({ uuid, payload }));

    stubPersistGameResult(t);
    const session = makeEndedSession();
    persistTerminalSession(session, { completed: true });
    await flushAsync();

    assert.equal(__getTerminalPersistRunsForTests().length, 0);
    assert.deepEqual(pendingWhenEvaluationStarted, [0, 0, 0]);
    assert.deepEqual(invalidations.map((e) => e.uuid).sort(), ["u1", "u2", "u3"]);
    assert.ok(invalidations.every((e) => e.payload.scopes.includes("profile")));
    assert.equal(
        invalidations.some((e) => e.payload.scopes.includes("achievements")),
        false,
        "평가가 끝나기 전에는 업적·경제 무효화가 나가지 않는다 — 저장 완료만으로는 지급이 끝나지 않았다",
    );

    releaseEvaluation();
    await flushAsync();

    assert.deepEqual(
        invalidations.filter((e) => e.payload.scopes.includes("achievements")).map((e) => e.uuid).sort(),
        ["u1", "u2", "u3"],
    );
});

test("F-21 A-09: 4096개를 넘겨 확인해도 **그 session의** 늦은 훅은 레코드를 다시 조립하지 않는다", async (t) => {
    withSocketLayer(t);

    const evaluated = [];
    __setEvaluateAchievementsForTests(async (userId) => { evaluated.push(userId); });
    t.after(() => __setEvaluateAchievementsForTests());

    const invalidations = [];
    gameSessionSocket.setEmitToUser((uuid, event, payload) => invalidations.push({ uuid, event, payload }));

    const persisted = [];
    stubPersistGameResult(t, (record) => {
        persisted.push(record);
        return Promise.resolve({ persisted: true, gameId: record.result.id });
    });

    const session = makeEndedSession({ id: "game-evicted" });
    persistTerminalSession(session, { completed: true });
    await flushAsync();
    assert.equal(persisted.length, 1);
    const firstRecord = persisted[0];
    assert.equal(evaluated.length, 3);
    const invalidationsAfterFirst = invalidations.length;

    for (let i = 0; i < 4200; i += 1) {
        const other = makeEndedSession({ id: `game-filler-${i}` });
        persistTerminalSession(other, { completed: true });
    }
    await flushAsync();
    assert.equal(persisted.length, 4201);

    session.players.clear();
    session.endedAt = 999_999_999;
    persistTerminalSession(session, { completed: true });
    await flushAsync();

    assert.equal(persisted.length, 4201, "축출된 gameId의 늦은 훅이 레코드를 다시 조립했다");
    assert.equal(evaluated.length, 3 + 4201 * 3 - 3, "같은 판의 업적 평가가 두 번 일어났다");
    const mine = invalidations.slice(invalidationsAfterFirst).filter((e) => e.payload.gameId === session.id);
    assert.deepEqual(mine, []);

    assert.equal(new Date(firstRecord.result.ended_at).getTime(), 61_000);
    assert.equal(firstRecord.players.length, 3);
    assert.throws(() => { "use strict"; firstRecord.result.ended_at = 1; }, TypeError);
    assert.equal(new Date(firstRecord.result.ended_at).getTime(), 61_000);
});

test("F-21 A-09: 같은 session 객체의 중복 훅은 확인 **이전**에도 두 번째 작업을 만들지 않는다", async (t) => {
    withSocketLayer(t);
    const timers = useManualPersistTimers(t);

    const attempts = [];
    stubPersistGameResult(t, (record) => {
        attempts.push(record);
        return Promise.reject(new Error("DB 다운"));
    });

    const session = makeEndedSession({ id: "game-inflight" });
    persistTerminalSession(session, { completed: true });
    await flushAsync();
    assert.equal(attempts.length, 1);

    persistTerminalSession(session, { completed: true });
    await flushAsync();
    assert.equal(attempts.length, 1, "미확인 상태에서 두 번째 저장 작업이 생겼다");
    assert.equal(__getTerminalPersistRunsForTests().length, 1);

    timers.fire();
    await flushAsync();
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1], attempts[0], "재시도가 새 레코드를 조립했다");
});
