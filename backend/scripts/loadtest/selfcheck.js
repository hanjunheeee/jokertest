// 부하 도구 자가 점검 파일, 서버·DB 없이 부하 도구의 판단(막기·셈·판 하나·서버 사건 이름)을 확인 (봇 행동은 selfcheck-bot.js)
// 부하 걸기 전에 한 번 돌림: backend 폴더에서 node --test scripts/loadtest/selfcheck.js scripts/loadtest/selfcheck-bot.js (npm test엔 안 들어감)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const target = require("./target");
const { Stats, percentile } = require("./stats");
const dbcount = require("./dbcount");
const { parseArgs, loadEnv, dbCounter } = require("./run");
const { summarizeServer } = require("./sampler");
const report = require("./report");
const { playGame, roomSettingsFor } = require("./game");
const { nicknameOf } = require("./accounts");

const errorOf = (fn) => { try { fn(); return null; } catch (error) { return error; } };

// ── 막기: 개발 서버 포트·개발 DB ──

test("대상: 로컬 4000번(개발 서버)은 거부, 4100·4101은 통과", () => {
    for (const url of ["http://127.0.0.1:4000", "http://localhost:4000"]) {
        assert.match(errorOf(() => target.checkTargetAllowed({ target: url }))?.message ?? "", /개발 서버 포트/);
    }
    assert.equal(target.checkTargetAllowed({ target: "http://127.0.0.1:4100" }).origin, "http://127.0.0.1:4100");
    assert.equal(target.checkTargetAllowed({ target: "http://localhost:4101" }).local, true);
});

test("대상: 로컬 아닌 주소는 깃발·계정 파일 둘 다 있어야 통과", () => {
    assert.ok(errorOf(() => target.checkTargetAllowed({ target: "https://api.staging.example.test" })));
    assert.ok(errorOf(() => target.checkTargetAllowed({ target: "https://api.staging.example.test", allowRemote: true })));
    assert.equal(
        target.checkTargetAllowed({ target: "https://api.staging.example.test", allowRemote: true, accountsFile: "a.json" }).local,
        false,
    );
});

test("DB: 개발 DB 이름(joker·joker_realgame)은 --allow-db로 줘도 거부", () => {
    for (const name of ["joker", "joker_realgame", "JOKER_REALGAME"]) {
        const url = `mysql://fakeuser:fakepass@127.0.0.1:3306/${name}`;
        assert.match(errorOf(() => target.assertLocalDatabase(url, "development"))?.message ?? "", /개발 DB/);
        assert.match(errorOf(() => target.assertLocalDatabase(url, "development", { allowDbNames: [name] }))?.message ?? "", /개발 DB/);
    }
});

test("DB: 시험 DB 이름만 통과, 모르는 이름은 --allow-db로 줄 때만", () => {
    assert.equal(target.assertLocalDatabase("mysql://u:p@127.0.0.1:3306/joker_e2e", "development"), "joker_e2e");
    assert.equal(target.assertLocalDatabase("mysql://u:p@localhost:3306/joker_loadtest", undefined), "joker_loadtest");
    assert.match(errorOf(() => target.assertLocalDatabase("mysql://u:p@127.0.0.1:3306/some_db", "development"))?.message ?? "", /시험 DB 이름이 아님/);
    assert.equal(target.assertLocalDatabase("mysql://u:p@127.0.0.1:3306/some_db", "development", { allowDbNames: ["some_db"] }), "some_db");
});

test("DB: 로컬 아닌 호스트·운영 환경이면 거부", () => {
    assert.ok(errorOf(() => target.assertLocalDatabase("mysql://u:p@db.example.test:3306/joker_e2e", "development")));
    assert.ok(errorOf(() => target.assertLocalDatabase("mysql://u:p@127.0.0.1:3306/joker_e2e", "production")));
    assert.ok(errorOf(() => target.assertLocalDatabase(undefined, "development")));
});

test("문장 모양별 셈: 개발 DB·모르는 이름·이상한 글자는 안 봄", () => {
    assert.equal(dbcount.assertDigestSchema("joker_e2e"), "joker_e2e");
    for (const name of ["joker_realgame", "joker", "other_db", "joker_e2e'; DROP"]) assert.ok(errorOf(() => dbcount.assertDigestSchema(name)), name);
});

// ── 설정값 ──

test("설정: 기본 대상은 4100, 인원 5~10만, 쉼표 값은 목록으로", () => {
    assert.equal(parseArgs([]).target, "http://127.0.0.1:4100");
    assert.ok(errorOf(() => parseArgs(["--players", "4"])));
    assert.ok(errorOf(() => parseArgs(["--players", "11"])));
    const opts = parseArgs(["--players", "10", "--sample-urls", "http://127.0.0.1:4101,http://127.0.0.1:4102", "--allow-db", "a,b", "--db-env", "x.env"]);
    assert.deepEqual(opts.sampleUrlList, ["http://127.0.0.1:4101", "http://127.0.0.1:4102"]);
    assert.deepEqual(opts.allowDbList, ["a", "b"]);
    assert.equal(opts.dbEnv, "x.env");
});

test("--db-env: 그 파일의 DB 주소·내부 열쇠만 읽고 다른 값은 안 꺼냄", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lt-selfcheck-")), "fake.env");
    fs.writeFileSync(file, "# 가짜 값\nDATABASE_URL=mysql://fakeuser:fakepass@127.0.0.1:3306/joker_e2e\nINTERNAL_API_KEY=fake-internal-key-0123456789-0123456789\nFAKE_OTHER_SECRET=should-not-load\n");
    const saved = process.env.DATABASE_URL;
    try {
        const opts = parseArgs(["--db-env", file]);
        loadEnv(opts);
        assert.equal(target.databaseNameOf(process.env.DATABASE_URL), "joker_e2e");
        assert.equal(opts.internalKey, "fake-internal-key-0123456789-0123456789");
        assert.equal(process.env.FAKE_OTHER_SECRET, undefined);
    } finally {
        if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
});

// ── 셈 ──

test("숫자: 95% 자리·오류율(오류 ÷ (답 받은 요청 + 오류))·거절은 오류율에 안 셈", () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
    const stats = new Stats();
    for (let i = 0; i < 9; i += 1) stats.latency("x", 10);
    stats.error("x:timeout");
    stats.rejection("x:INVALID_PHASE");
    assert.equal(stats.errorCount, 1);
    assert.equal(stats.errorRate, 0.1);
    assert.deepEqual(stats.summary().rejections, { "x:INVALID_PHASE": 1 });
});

test("DB 셈: 앞뒤 차이에서 재는 문장 하나를 빼고, 판 수·동시 판 수로 나눔", () => {
    const before = { at: 1_000, values: { questions: 100, select: 60, insert: 10, update: 5, delete: 0, begin: 3, commit: 3, rollback: 0 } };
    const after = { at: 101_000, values: { questions: 501, select: 360, insert: 50, update: 25, delete: 0, begin: 13, commit: 13, rollback: 0 } };
    const diff = dbcount.diffStatus(before, after);
    assert.equal(diff.questions, 400);
    assert.equal(diff.seconds, 100);
    assert.deepEqual(dbcount.perGame(diff, 4, 2), { perGame: 100, perSecond: 4, perGameSecond: 2, writesPerGame: 15 });
    assert.equal(dbcount.perGame(diff, 0).perGame, null);
    assert.match(dbcount.formatDbLine(diff, 4, 2), /판 하나당 100/);
});

test("문장 모양별 셈: 늘어난 것만, 많이 불린 순으로", () => {
    const before = { at: 0, rows: { a: { count: 5, text: "SELECT a" }, b: { count: 1, text: "SELECT b" } } };
    const after = { at: 1000, rows: { a: { count: 5, text: "SELECT a" }, b: { count: 21, text: "SELECT b" }, c: { count: 50, text: "INSERT c" } } };
    assert.deepEqual(dbcount.diffDigests(before, after, 10), [
        { count: 50, perGame: 5, text: "INSERT c" },
        { count: 20, perGame: 2, text: "SELECT b" },
    ]);
});

test("서버 숫자: 서버 2대면 서버마다 따로 + 접속·판 수는 더함", () => {
    const sample = (origin, serverId, rss, online, games) => ({
        origin, serverId, memoryMb: { rss, heapUsed: 50 }, eventLoopDelayMs: { p95: 21, max: 30 }, connections: { onlineUsers: online, games },
    });
    const summary = summarizeServer([sample("http://a", "e2e-n1", 150, 120, 20), sample("http://b", "e2e-n2", 170, 130, 30), sample("http://a", "e2e-n1", 160, 125, 25)]);
    assert.equal(summary.rssMbMax, 170);
    assert.equal(summary.byNode["e2e-n1"].rssMbMax, 160);
    assert.equal(summary.onlineUsersMax, 255);
    assert.equal(summary.gamesMax, 55);
    assert.equal(summarizeServer([sample("http://a", null, 150, 5, 1)]).byNode, undefined);
    assert.equal(summarizeServer([]), null);
});

test("DB 셈 틀: 판 돌리기 앞뒤 값을 읽어 판 하나당 값을 냄, DB에 안 붙었으면 숫자 없음", async () => {
    let questions = 1000;
    const fakeDb = { sequelize: { query: async () => { questions += 301; return [[{ Variable_name: "Questions", Value: String(questions) }, { Variable_name: "Com_select", Value: "7" }]]; } } };
    const counter = dbCounter(fakeDb, { settleMs: 1 });
    await counter.before();
    const result = await counter.after(3, 3);
    assert.equal(result.diff.questions, 300);
    assert.equal(result.perGame, 100);
    assert.match(result.line, /판 하나당 100/);
    const none = dbCounter(null);
    await none.before();
    assert.equal(await none.after(3, 3), null);
});

test("결과 찍기: 한 번 돌린 표·단계별 표·문장 모양별 표가 숫자를 담아 찍힘", () => {
    const stats = new Stats();
    stats.latency("create_room", 12);
    stats.error("game:create_failed");
    stats.gamesFailed = 1;
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(" "));
    try {
        const server = { rssMbMax: 150, heapUsedMbMax: 60, eventLoopP95MsMax: 22, onlineUsersMax: 10, gamesMax: 2, byNode: { "e2e-n1": { rssMbMax: 150, eventLoopP95MsMax: 22, onlineUsersMax: 5, gamesMax: 1 } } };
        report.printFixed(stats.summary(), server, { rss: 80 * 1024 * 1024 }, "DB 질의        전체 300");
        report.printStageTable([{ concurrent: 5, summary: stats.summary(), server, db: { perGame: 100, perGameSecond: 0.7 }, pass: false, reason: "오류율" }]);
        report.printStatements({ statementTotal: 50, statements: [{ count: 50, perGame: 25, text: "SELECT x" }] }, 2);
        report.printStatements(null, 2);
    } finally {
        console.log = original;
    }
    const text = lines.join(" / ");
    for (const part of ["실패 1", '"game:create_failed":1', "DB 질의        전체 300", "e2e-n1", "멈춤(오류율)", "| 100 | 0.7 |", "판 하나당 25번", "SELECT x"]) {
        assert.ok(text.includes(part), `${part} 없음`);
    }
});

test("판정: 오류·실패한 판·끊김·덜 붙은 사용자·덜 끝난 판이 하나라도 있으면 실패", () => {
    const base = () => ({ errorCount: 0, disconnects: 0, games: { started: 2, ended: 2, failed: 0 } });
    const judge = (change, extra = {}) => report.judgeFixed({ summary: { ...base(), ...change }, accounts: 10, connected: 10, expectedGames: 2, ...extra });
    assert.equal(judge({}).ok, true);
    assert.match(judge({}).line, /통과/);
    assert.equal(judge({ errorCount: 1 }).ok, false);
    assert.equal(judge({ disconnects: 1 }).ok, false);
    assert.equal(judge({ games: { started: 2, ended: 1, failed: 1 } }).ok, false);
    assert.equal(judge({ games: { started: 1, ended: 1, failed: 0 } }).ok, false);
    assert.equal(judge({}, { connected: 9 }).ok, false);
    assert.match(judge({ errorCount: 3 }).line, /실패 — 오류 3/);
});

// ── 판 하나 ──

// 판 하나에 쓸 가짜 봇 묶음: 방장 답·판 끝 값을 정해 줌
function fakeTable({ created, start = { ok: true, gameId: "g1" }, outcomes = ["ENDED", "ENDED", "ENDED", "ENDED", "ENDED"] } = {}) {
    const sent = [];
    return outcomes.map((outcome, i) => ({
        request: async (event, payload) => {
            sent.push({ bot: i, event, payload });
            if (event === "create_room") return created ?? { ok: true, room: { roomId: "r1", roomCode: "ABC123", settingsVersion: 1 } };
            if (event === "start_game") return start;
            return { ok: true };
        },
        emit: (event, payload) => { sent.push({ bot: i, event, payload }); },
        waitFor: async (event) => (event === "room_join_failed" ? new Promise(() => {}) : { roomId: "r1" }),
        playUntilEnded: async () => outcome,
        sent,
    }));
}
const gameOpts = (stats) => ({ pollMs: 1, chatChance: 0, gameMaxMs: 1000, stats });

test("판: 끝까지 가면 끝난 판 1, 방 설정은 서버가 받는 값(정원 5~10·시간 30초·광대 1)", async () => {
    const stats = new Stats();
    const bots = fakeTable();
    assert.equal(await playGame(bots, gameOpts(stats)), "ENDED");
    assert.deepEqual([stats.gamesStarted, stats.gamesEnded, stats.gamesFailed, stats.errorCount], [1, 1, 0, 0]);
    const { validateCreateRoomPayload } = require("../../validations/room/create");
    for (const players of [5, 7, 10]) assert.equal(validateCreateRoomPayload(roomSettingsFor(players)).ok, true, `${players}명`);
    const leaves = bots[0].sent.filter((s) => s.event === "leave_game_session");
    assert.equal(leaves.length, 5);
    assert.deepEqual(leaves[0].payload, { gameId: "g1" });
});

test("판: 방 만들기 거절(글만 옴)·시작 거절·끝까지 못 감은 오류와 실패한 판으로 셈", async () => {
    const createFail = new Stats();
    assert.match(await playGame(fakeTable({ created: { ok: false, message: "방을 생성하지 못했습니다." } }), gameOpts(createFail)), /방 만들기 실패/);
    assert.deepEqual([createFail.gamesFailed, createFail.summary().errors], [1, { "game:create_failed": 1 }]);

    const timedOut = new Stats();
    assert.match(await playGame(fakeTable({ outcomes: ["ENDED", "ENDED", "TIMEOUT", "ENDED", "ENDED"] }), gameOpts(timedOut)), /끝까지 못 감: ENDED,TIMEOUT/);
    assert.deepEqual([timedOut.gamesEnded, timedOut.gamesFailed, timedOut.summary().errors], [0, 1, { "game:not_finished": 1 }]);

    const vanished = new Stats();
    assert.match(await playGame(fakeTable({ outcomes: ["VANISHED", "VANISHED", "VANISHED", "VANISHED", "VANISHED"] }), gameOpts(vanished)), /VANISHED/);
    assert.equal(vanished.gamesFailed, 1);

    const oneLost = new Stats();
    assert.equal(await playGame(fakeTable({ outcomes: ["ENDED", "LOST", "ENDED", "ENDED", "ENDED"] }), gameOpts(oneLost)), "ENDED");
    assert.equal(oneLost.gamesEnded, 1);
});

// ── 서버와 맞는지 ──

test("계정: 시험 닉네임이 가입 규칙(2~8자·한글영문숫자)에 맞고 서로 안 겹침", () => {
    const { validateNickname } = require("../../validations/auth/signup");
    const names = Array.from({ length: 2000 }, (_, i) => nicknameOf("a1b", i + 1));
    for (const name of [names[0], names[499], names[1999]]) assert.equal(validateNickname(name).ok, true, name);
    assert.equal(new Set(names).size, names.length);
});

test("사건 이름: 봇이 보내는 사건을 서버가 전부 받고, 봇이 기다리는 알림을 서버가 보냄", () => {
    const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
    const botSource = read("bot.js") + read("game.js");
    const sent = new Set([...botSource.matchAll(/(?:request|emit)\("([a-z_]+)"/g)].map((m) => m[1]));
    const serverSource = read("..", "..", "socket", "gameSession", "handlers", "register.js") + read("..", "..", "socket", "matchmaking", "registerEvents.js");
    const received = new Set([...serverSource.matchAll(/socket\.on\('([a-z_]+)'/g)].map((m) => m[1]));
    assert.ok(sent.size >= 12, `봇 사건을 못 읽음: ${[...sent]}`);
    assert.deepEqual([...sent].filter((event) => !received.has(event)), []);
    // 없앤 사건(낮 집계·재판 판정·밤 종료 단추)을 봇이 안 보냄
    for (const gone of ["resolve_day_vote", "resolve_tribunal_vote", "end_night", "kick_game_player"]) assert.equal(sent.has(gone), false, gone);
    const emits = read("..", "..", "socket", "matchmaking", "join", "joinCommit.js") + read("..", "..", "socket", "matchmaking", "join", "guards.js")
        + read("..", "..", "socket", "matchmaking", "room", "startLaunch.js");
    for (const event of ["room_joined", "room_join_failed", "game_started"]) assert.ok(emits.includes(`emit('${event}'`), event);
});
