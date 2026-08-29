const test   = require("node:test");
const assert = require("node:assert/strict");

// verifyToken(JWT·세션·밴 조회)은 이 AC의 관심사가 아니므로 라우터가 아니라 컨트롤러를
// 직접 태웁니다. 라우터는 컨트롤러를 그 경로에 붙였는지만 따로 확인합니다.
const db             = require("../models");
const gameController = require("../controller/game.controller");
const gameRouter     = require("../routes/game.routes");
const { verifyToken } = require("../middleware/auth.middleware");

const GAME_ROW = {
    id: "game-42",
    room_id: "room-7",
    winner: "CITIZEN",
    win_reason: "ALL_JOKERS_ELIMINATED",
    started_at: new Date("2026-08-30T10:00:00.000Z"),
    ended_at: new Date("2026-08-30T10:12:30.000Z"),
    day_index: 3,
    player_count: 3,
    settings: { jokerCount: 1, roleComposition: { JOKER: 1, CITIZEN: 2 }, timerSettings: { dayDiscussionTime: 90 } },
    completed: true,
    GameResultPlayers: [
        { user_id: "u1", nickname_snapshot: "닉1", role: "CITIZEN", team: "CITIZEN", won: true,  is_alive: true,  death_reason: null },
        { user_id: "u2", nickname_snapshot: "닉2", role: "DOCTOR",  team: "CITIZEN", won: true,  is_alive: false, death_reason: "NIGHT_KILL" },
        { user_id: "u3", nickname_snapshot: "닉3", role: "JOKER",   team: "JOKER",   won: false, is_alive: false, death_reason: "EXECUTION" },
    ],
};

const setupFakeDb = (t, row) => {
    const original = db.GameResult;
    const seen = [];
    db.GameResult = {
        findOne: async (options) => {
            seen.push(options);
            return options.where.id === row?.id ? { get: () => row } : null;
        },
    };
    t.after(() => {
        db.GameResult = original;
    });
    return seen;
};

const callGetGameResult = async (gameId) => {
    let status;
    let body;
    const res = {
        status(code) {
            status = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    await gameController.getGameResult({ params: { gameId } }, res, (err) => {
        throw err;
    });
    return { status, body };
};

test("AC-06: 단건 조회가 게임 헤더와 참가자 필드를 정확히 반환한다", async (t) => {
    const seen = setupFakeDb(t, GAME_ROW);

    const { status, body } = await callGetGameResult("game-42");

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(seen[0].where.id, "game-42");
    // 참가자는 헤더와 같은 왕복에서 join으로 함께 읽는다.
    assert.equal(seen[0].include.length, 1);

    assert.equal(body.data.game_id, "game-42");
    assert.equal(body.data.winner, "CITIZEN");
    assert.equal(body.data.win_reason, "ALL_JOKERS_ELIMINATED");
    assert.equal(body.data.started_at, GAME_ROW.started_at);
    assert.equal(body.data.ended_at, GAME_ROW.ended_at);
    assert.equal(body.data.day_index, 3);
    assert.equal(body.data.player_count, 3);
    assert.equal(body.data.completed, true);
    assert.deepEqual(body.data.settings, GAME_ROW.settings);

    assert.deepEqual(body.data.players, [
        { uuid: "u1", nickname_snapshot: "닉1", role: "CITIZEN", team: "CITIZEN", won: true,  is_alive: true,  death_reason: null },
        { uuid: "u2", nickname_snapshot: "닉2", role: "DOCTOR",  team: "CITIZEN", won: true,  is_alive: false, death_reason: "NIGHT_KILL" },
        { uuid: "u3", nickname_snapshot: "닉3", role: "JOKER",   team: "JOKER",   won: false, is_alive: false, death_reason: "EXECUTION" },
    ]);
});

test("AC-06: 중단 경기의 미확정 승패(won=null)가 그대로 전달된다", async (t) => {
    setupFakeDb(t, {
        ...GAME_ROW,
        id: "game-abort",
        winner: "NONE",
        win_reason: "ABORTED",
        completed: false,
        GameResultPlayers: [
            { user_id: "a1", nickname_snapshot: "닉A", role: "CITIZEN", team: "CITIZEN", won: null,  is_alive: true,  death_reason: null },
            { user_id: "a3", nickname_snapshot: "닉C", role: "JOKER",   team: "JOKER",   won: false, is_alive: false, death_reason: "DISCONNECT" },
        ],
    });

    const { status, body } = await callGetGameResult("game-abort");

    assert.equal(status, 200);
    assert.equal(body.data.completed, false);
    assert.equal(body.data.winner, "NONE");
    assert.equal(body.data.players[0].won, null);
    assert.equal(body.data.players[1].won, false);
    assert.equal(body.data.players[1].death_reason, "DISCONNECT");
});

test("AC-06: 없는 게임 id는 404", async (t) => {
    setupFakeDb(t, GAME_ROW);

    const { status, body } = await callGetGameResult("game-does-not-exist");

    assert.equal(status, 404);
    assert.deepEqual(body, { success: false, message: "게임 기록을 찾을 수 없습니다." });
});

test("AC-06: 빈 game id는 400이며 DB를 조회하지 않는다", async (t) => {
    const seen = setupFakeDb(t, GAME_ROW);

    const { status, body } = await callGetGameResult("   ");

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(seen.length, 0);
});

test("AC-06: GET /:gameId 라우트가 인증 뒤에 컨트롤러를 붙인다", () => {
    const layer = gameRouter.stack.find((entry) => entry.route?.path === "/:gameId");
    assert.ok(layer, "GET /:gameId 라우트가 등록돼 있어야 한다");
    assert.equal(layer.route.methods.get, true);

    // Layer가 실제 핸들러를 어느 속성에 담는지는 express 버전마다 다르므로 둘 다 본다.
    const handlers = layer.route.stack.map((entry) => entry.handle ?? entry.handler);
    assert.equal(handlers.length, 2, "인증 미들웨어와 컨트롤러 두 개가 붙어 있어야 한다");
    assert.equal(handlers[0], verifyToken, "인증이 컨트롤러보다 먼저 와야 한다");
    assert.equal(handlers[1], gameController.getGameResult);
});
