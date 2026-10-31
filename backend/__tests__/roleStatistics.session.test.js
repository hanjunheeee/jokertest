const test   = require("node:test");
const assert = require("node:assert/strict");

const gameSessionCore = require("../game-core/gameSession");

const { buildGameResultRecord } = gameSessionCore;
const { buildSessionCandidate, resolveGameSource } = gameSessionCore.__testables;

const withNodeEnv = (value, fn) => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = value;
    try {
        return fn();
    } finally {
        process.env.NODE_ENV = original;
    }
};

const makeRoom = (overrides = {}) => ({
    id: "room-1",
    players: new Map([
        ["u1", { uuid: "u1", nickname: "닉1" }],
        ["u2", { uuid: "u2", nickname: "닉2" }],
        ["u3", { uuid: "u3", nickname: "닉3" }],
    ]),
    settings: {},
    ...overrides,
});

test("resolveGameSource: NODE_ENV=test(자동 시험)만 test, 그 외(개발·QA·운영)는 전부 production이다 — 2026-09-22 운영자 결정", () => {
    withNodeEnv("production", () => assert.equal(resolveGameSource(), "production"));
    withNodeEnv("test", () => assert.equal(resolveGameSource(), "test"));
    withNodeEnv("development", () => assert.equal(resolveGameSource(), "production"));
    withNodeEnv(undefined, () => assert.equal(resolveGameSource(), "production"));
});

test("buildSessionCandidate: 세션 생성 시점의 서버 NODE_ENV로 session.gameSource가 고정된다", () => {
    withNodeEnv("production", () => {
        const result = buildSessionCandidate(makeRoom());
        assert.equal(result.ok, true);
        assert.equal(result.session.gameSource, "production");
    });
});

test("buildSessionCandidate: room.settings에 담긴 클라이언트 값은 gameSource 판정에 전혀 영향을 주지 않는다", () => {
    withNodeEnv("production", () => {
        const spoofedRoom = makeRoom({
            settings: { gameSource: "production", isDev: true, source: { value: "production" } },
        });
        const result = buildSessionCandidate(spoofedRoom);
        assert.equal(result.ok, true);
        assert.equal(result.session.gameSource, "production");
    });

    withNodeEnv("development", () => {
        const spoofedRoom = makeRoom({
            settings: { gameSource: "production", isDev: false },
        });
        const result = buildSessionCandidate(spoofedRoom);
        assert.equal(result.ok, true);
        assert.equal(result.session.gameSource, "production");
    });
    withNodeEnv("test", () => {
        const spoofedRoom = makeRoom({ settings: { gameSource: "production", isDev: false } });
        const result = buildSessionCandidate(spoofedRoom);
        assert.equal(result.ok, true);
        assert.equal(result.session.gameSource, "test");
    });
});

test("buildSessionCandidate: 서버가 재시작해 NODE_ENV가 바뀌어도 이미 만든 세션의 gameSource는 그대로다", () => {
    const session = withNodeEnv("production", () => buildSessionCandidate(makeRoom()).session);
    assert.equal(session.gameSource, "production");

    withNodeEnv("development", () => {
        assert.equal(session.gameSource, "production");
    });
});

const makePlayer = (uuid, role, alive = true) => [uuid, {
    uuid, nickname: `nick-${uuid}`, role, team: role === "JOKER" ? "JOKER" : "CITIZEN", alive, deathReason: null,
}];

const makeEndedSession = (overrides = {}) => ({
    id: "game-1",
    roomId: "room-1",
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
        makePlayer("u3", "JOKER", false),
    ]),
    ...overrides,
});

test("buildGameResultRecord: session.gameSource가 settings.gameSource.value로 버전과 함께 보존된다", () => {
    const record = buildGameResultRecord(makeEndedSession({ gameSource: "production" }), { completed: true });
    assert.deepEqual(record.result.settings.gameSource, { v: 1, value: "production" });
});

test("buildGameResultRecord: gameSource가 development인 세션도 그대로 development로 저장된다", () => {
    const record = buildGameResultRecord(makeEndedSession({ gameSource: "development" }), { completed: true });
    assert.deepEqual(record.result.settings.gameSource, { v: 1, value: "development" });
});

test("buildGameResultRecord: session.gameSource가 없는(수동 조립) 세션은 현재 프로세스 환경으로 대신한다", () => {
    withNodeEnv("production", () => {
        const record = buildGameResultRecord(makeEndedSession(), { completed: true });
        assert.deepEqual(record.result.settings.gameSource, { v: 1, value: "production" });
    });
});
