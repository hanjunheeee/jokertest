const test   = require("node:test");
const assert = require("node:assert/strict");

// 이 파일은 순수 game-core 함수만 태운다(DB를 전혀 몰라야 한다) — backend/models를
// require하지 않으므로 DATABASE_URL 폴백이 필요 없다.
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

// ── A-07: 서버 환경으로만 판정, 클라이언트 입력은 무시 ──────────────────────────

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
        // 클라이언트가 room.settings에 임의로 gameSource/isDev 같은 필드를 채워 보내도
        // buildSessionCandidate는 그 필드를 아예 읽지 않는다 — 서버 NODE_ENV만 본다.
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
        // 2026-09-22: 개발 서버의 판도 집계된다(production). 클라이언트 값은 여전히 무시된다 — 아래 test 환경 케이스가 그것을 증명한다.
        assert.equal(result.session.gameSource, "production");
    });
    withNodeEnv("test", () => {
        const spoofedRoom = makeRoom({ settings: { gameSource: "production", isDev: false } });
        const result = buildSessionCandidate(spoofedRoom);
        assert.equal(result.ok, true);
        // 클라이언트가 "production"이라 우겨도 자동 시험 환경이면 test로 고정된다.
        assert.equal(result.session.gameSource, "test");
    });
});

test("buildSessionCandidate: 서버가 재시작해 NODE_ENV가 바뀌어도 이미 만든 세션의 gameSource는 그대로다", () => {
    const session = withNodeEnv("production", () => buildSessionCandidate(makeRoom()).session);
    assert.equal(session.gameSource, "production");

    // "재시작"을 흉내낸다 — 이후 이 프로세스의 NODE_ENV가 development로 바뀌어도, 이미
    // 만들어진 session 객체의 필드는 그 순간에 고정된 값 그대로다(재계산되지 않는다).
    withNodeEnv("development", () => {
        assert.equal(session.gameSource, "production");
    });
});

// ── buildGameResultRecord: 세션의 gameSource가 결과 레코드 settings에 그대로 보존된다 ──

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
