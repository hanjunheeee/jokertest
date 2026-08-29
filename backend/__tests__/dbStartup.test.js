const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");
const net    = require("node:net");
const { spawnSync }   = require("node:child_process");
const { once }        = require("node:events");

const ENTRYPOINT = path.join(__dirname, "..", "index.js");

// 0번 포트로 잠깐 listen해서 비어 있는 포트를 얻습니다. index.js는 PORT를
// `Number(process.env.PORT) || 4000`로 읽어 "0"을 4000으로 되돌리기 때문에,
// server.listen(0)에 맡기지 않고 구체적인 포트를 미리 정해 넘겨야 합니다.
const findFreePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

test("잘못된 DATABASE_URL로 기동하면 exit code 1로 종료된다", () => {
    // 연결이 즉시 거부되는(ECONNREFUSED) 주소입니다. 문법은 유효하므로 new Sequelize()는
    // 통과하고, db.sequelize.sync() 단계에서 reject되어 index.js의 catch로 들어갑니다.
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: {
            ...process.env,
            DATABASE_URL:    "mysql://bad:bad@127.0.0.1:1/nonexistent_db",
            // 커넥션을 못 얻을 때 30초를 기다리지 않도록 줄입니다.
            DB_POOL_ACQUIRE: "2000",
        },
        encoding: "utf8",
        timeout:  60000,
    });

    // stdout/stderr는 검사하지 않습니다 — Windows에서 파이프로 연결된 stderr는
    // 비동기라 process.exit(1) 직후 잘릴 수 있습니다. 로그 형식은 AC-04(수동)에서
    // 터미널(동기 출력)로 확인합니다.
    assert.equal(result.signal, null, "타임아웃으로 강제 종료되면 안 됩니다");
    assert.equal(result.status, 1, `종료 코드가 1이 아닙니다 (실제: ${result.status})`);
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

    // 재시도 루프가 생기면 acquire 타임아웃의 배수만큼 시간이 늘어납니다.
    // 한 번만 시도하고 죽는지를 소요 시간으로 확인합니다.
    assert.ok(
        Date.now() - started < 20000,
        "기동 실패가 20초 안에 끝나지 않았습니다 — 재시도 로직이 생겼는지 확인하세요"
    );
});

test("정상 기동 후 REST 요청과 소켓 핸드셰이크가 동작한다", async (t) => {
    // 실제 MySQL 없이 기동 경로만 태웁니다. index.js가 require("./models")로 얻는 객체와
    // 여기서 얻는 객체는 require 캐시상 같으므로, 아래 스텁이 그대로 쓰입니다.
    const db = require("../models");
    db.sequelize.sync = async () => db.sequelize;

    process.env.PORT = String(await findFreePort());

    const { server, io } = require(ENTRYPOINT);

    // sync()가 마이크로태스크로 풀린 뒤 listen이 호출되므로 'listening'을 기다립니다.
    await once(server, "listening");

    t.after(async () => {
        // io.close()가 붙어 있는 엔진 소켓과 그 타이머까지 정리합니다.
        // (정리하지 않으면 핸들이 남아 테스트 프로세스가 끝나지 않습니다.)
        io.close();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
    });

    const base = `http://127.0.0.1:${server.address().port}`;

    // 1) 라우터 마운트 + cookieParser + 인증 미들웨어 + globalErrorHandler 경로
    const meRes  = await fetch(`${base}/auth/me`);
    const meBody = await meRes.json();
    assert.equal(meRes.status, 401, "/auth 라우터가 마운트되지 않았습니다");
    assert.equal(meBody.success, false);

    // 2) express.json()이 살아 있고 POST 라우트가 붙어 있는지 (401/4xx면 배선은 정상)
    const loginRes = await fetch(`${base}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
    });
    assert.ok(loginRes.status >= 400 && loginRes.status < 500,
        `/auth/login이 4xx를 반환해야 합니다 (실제: ${loginRes.status})`);

    // 3) 미들웨어 체인 맨 끝의 notFoundHandler
    const missingRes  = await fetch(`${base}/__no_such_route__`);
    const missingBody = await missingRes.json();
    assert.equal(missingRes.status, 404);
    assert.equal(missingBody.success, false);

    // 4) socket.io가 http 서버에 붙어 있는지 — engine.io 핸드셰이크로 확인합니다.
    //    (인증된 세션까지는 확인하지 않습니다. authenticateSocket이 JWT 쿠키를 요구하므로
    //     여기서 검증하는 범위는 "소켓 서버가 부착되어 응답한다"까지입니다.)
    const handshakeRes  = await fetch(`${base}/socket.io/?EIO=4&transport=polling`);
    const handshakeBody = await handshakeRes.text();
    assert.equal(handshakeRes.status, 200, "socket.io가 http 서버에 부착되지 않았습니다");
    assert.match(handshakeBody, /"sid"/, "engine.io 핸드셰이크 응답에 sid가 없습니다");
});
