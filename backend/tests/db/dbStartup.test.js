const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");
const net    = require("node:net");
const { spawnSync }   = require("node:child_process");
const { once }        = require("node:events");

const ENTRYPOINT = path.join(__dirname, "..", "..", "index.js");

const findFreePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

test("잘못된 DATABASE_URL로 기동하면 exit code 1로 종료된다", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: {
            ...process.env,
            DATABASE_URL:    "mysql://bad:bad@127.0.0.1:1/nonexistent_db",
            DB_POOL_ACQUIRE: "2000",
        },
        encoding: "utf8",
        timeout:  60000,
    });

    assert.equal(result.signal, null, "타임아웃으로 강제 종료되면 안 됩니다");
    assert.equal(result.status, 1, `종료 코드가 1이 아닙니다 (실제: ${result.status})`);
    const failureLines = result.stderr.split(/\r?\n/).filter((line) => line.includes("[STARTUP] 실패"));
    assert.equal(failureLines.length, 1, `실패 로그는 정확히 한 줄이어야 합니다: ${result.stderr}`);
});

test("형식이 깨진 DATABASE_URL의 동기 초기화 오류도 한 줄 로그 후 exit code 1로 종료된다", () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: { ...process.env, DATABASE_URL: "not-a-database-url" },
        encoding: "utf8",
        timeout: 10000,
    });

    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    const failureLines = result.stderr.split(/\r?\n/).filter((line) => line.includes("[STARTUP] 실패"));
    assert.equal(failureLines.length, 1, `실패 로그는 정확히 한 줄이어야 합니다: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /\n\s+at\s/, "원시 스택 트레이스가 출력되면 안 됩니다");
});

test("DB 연결 실패 시 재시도 없이 한 번만 종료된다", () => {
    const started = Date.now();

    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: {
            ...process.env,
            DATABASE_URL:    "mysql://bad:bad@127.0.0.1:1/nonexistent_db",
            DB_POOL_ACQUIRE: "2000",
        },
        encoding: "utf8",
        timeout:  60000,
    });

    assert.equal(result.status, 1);

    assert.ok(
        Date.now() - started < 20000,
        "기동 실패가 20초 안에 끝나지 않았습니다 — 재시도 로직이 생겼는지 확인하세요"
    );
});

test("정상 기동 후 REST 요청과 소켓 핸드셰이크가 동작한다", async (t) => {
    const db = require("../../models");
    db.sequelize.sync = async () => db.sequelize;

    process.env.PORT = String(await findFreePort());

    const { server, io } = require(ENTRYPOINT);

    await once(server, "listening");

    t.after(async () => {
        io.close();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
    });

    const base = `http://127.0.0.1:${server.address().port}`;

    const meRes  = await fetch(`${base}/auth/me`);
    const meBody = await meRes.json();
    assert.equal(meRes.status, 401, "/auth 라우터가 마운트되지 않았습니다");
    assert.equal(meBody.success, false);

    const findIdRes  = await fetch(`${base}/auth/find-id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
    });
    const findIdBody = await findIdRes.json();
    assert.equal(findIdRes.status, 400, "POST /auth/find-id가 실제 app에 마운트되지 않았습니다");
    assert.deepEqual(findIdBody, { ok: false, code: "INVALID_INPUT" });

    const missingRes  = await fetch(`${base}/__no_such_route__`);
    const missingBody = await missingRes.json();
    assert.equal(missingRes.status, 404);
    assert.equal(missingBody.success, false);

    const handshakeRes  = await fetch(`${base}/socket.io/?EIO=4&transport=polling`);
    const handshakeBody = await handshakeRes.text();
    assert.equal(handshakeRes.status, 200, "socket.io가 http 서버에 부착되지 않았습니다");
    assert.match(handshakeBody, /"sid"/, "engine.io 핸드셰이크 응답에 sid가 없습니다");
});
