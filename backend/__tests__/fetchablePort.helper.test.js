'use strict';

// backend/tests/helpers/fetchablePort.js — f07·f32a가 쓰는 공용 bind helper를 실제 loopback
// TCP와 실제 전역 fetch로 검증한다(격리 DB와 무관하므로 항상 실행된다).
//
// 여기서 보려는 것은 네 가지다.
//   1) helper가 잡은 포트로 **실제 fetch가 성공한다**(Fetch 금지 포트를 피했다는 증거).
//   2) 금지 포트가 후보로 나와도 그 포트에 bind하지 않고 다음 후보로 넘어간다.
//   3) 이미 점유된 포트(EADDRINUSE)는 한정된 횟수 안에서만 재시도하고, 상한을 넘기면 조용히
//      성공한 척하지 않고 실패한다. 포트 문제가 아닌 오류는 삼키지 않는다.
//   4) close하면 그 포트가 실제로 풀린다(정리).
//
// 포트 선택 경로를 재현하려고 pickPort만 주입한다 — bind·응답·fetch는 전부 실제다.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
    FETCH_BAD_PORTS,
    HIGH_PORT_MIN,
    HIGH_PORT_MAX,
    isFetchablePort,
    randomFetchableHighPort,
    listenOnFetchablePort,
    listenOnFetchableUrl,
} = require('../tests/helpers/fetchablePort');

/** 고정 본문을 돌려주는 실제 HTTP 서버. 시험이 어떻게 끝나든 반드시 닫는다. */
const makeServer = (t, body = 'ok') => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain', 'Connection': 'close' });
        res.end(body);
    });
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(() => resolve()));
    });
    return server;
};

const isListening = (server) => Boolean(server.address());

/** 그 포트에 실제로 bind해 보고 성공하면 비어 있는 것이다(확인 후 곧바로 닫는다). */
const isPortFree = (port) => new Promise((resolve) => {
    const probe = http.createServer(() => {});
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
});

/** 특정 포트와 겹치지 않는 허용 고포트를 고른다(무작위 충돌로 인한 불안정 실패 방지). */
const otherFetchableHighPort = (...excluded) => {
    for (;;) {
        const port = randomFetchableHighPort();
        if (!excluded.includes(port)) return port;
    }
};

const textOf = async (url) => (await fetch(url)).text();

// ── 1) 실제 허용 포트에 bind하고 실제 fetch로 응답한다 ────────────────────────────

test('helper가 bind한 서버는 고포트 범위의 Fetch 허용 포트에서 실제 fetch에 응답한다', async (t) => {
    const server = makeServer(t, 'helper-real-http');
    const { port, host, url, attempts } = await listenOnFetchablePort(server);

    assert.equal(host, '127.0.0.1');
    assert.ok(port >= HIGH_PORT_MIN && port <= HIGH_PORT_MAX, `고포트 범위 밖입니다: ${port}`);
    assert.equal(FETCH_BAD_PORTS.has(port), false, `Fetch 금지 포트에 bind했습니다: ${port}`);
    assert.equal(url, `http://127.0.0.1:${port}`);
    assert.equal(attempts, 1);
    // 서버가 정말로 그 포트에 떠 있다(주소를 지어낸 것이 아니다).
    assert.equal(server.address().port, port);

    // 전역 fetch가 실제로 왕복한다 — 금지 포트였다면 여기서 "bad port"로 거부됐을 것이다.
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'helper-real-http');
});

test('listenOnFetchableUrl은 같은 bind를 수행하고 base URL만 돌려준다', async (t) => {
    const server = makeServer(t, 'url-form');
    const url = await listenOnFetchableUrl(server);

    assert.equal(url, `http://127.0.0.1:${server.address().port}`);
    assert.equal(await textOf(url), 'url-form');
});

// ── 2) 금지 포트는 고르지도, 쓰지도 않는다 ───────────────────────────────────────

test('무작위 포트 선택기는 언제나 고포트 범위의 허용 포트만 돌려준다', () => {
    for (let i = 0; i < 2000; i += 1) {
        const port = randomFetchableHighPort();
        assert.ok(port >= HIGH_PORT_MIN && port <= HIGH_PORT_MAX, `범위 밖: ${port}`);
        assert.equal(FETCH_BAD_PORTS.has(port), false, `금지 포트를 골랐습니다: ${port}`);
    }
});

test('실제 실패했던 금지 포트(2049·6697)는 허용 판정에서 거부된다', () => {
    // 2026-09-22 전체 실행에서 f07 fixture가 2049를, f32a 앱 서버가 6697을 받아 실패했다.
    assert.equal(isFetchablePort(2049), false);
    assert.equal(isFetchablePort(6697), false);
    assert.equal(isFetchablePort(10080), false);
    assert.equal(isFetchablePort(50000), true);
});

test('후보로 금지 포트가 나와도 그 포트에 bind하지 않고 다음 후보로 넘어간다', async (t) => {
    const server = makeServer(t, 'skipped-bad-port');
    const good = otherFetchableHighPort();
    const candidates = [2049, 6697, good];
    let index = 0;

    const { port, url, attempts } = await listenOnFetchablePort(server, {
        maxAttempts: candidates.length,
        pickPort: () => candidates[index++],
    });

    assert.equal(port, good);
    assert.equal(server.address().port, good, '금지 포트가 아니라 허용 포트에 떠 있어야 합니다');
    assert.equal(attempts, 3, '금지 포트 후보 2개를 건너뛰고 세 번째에 성공해야 합니다');
    assert.equal(index, 3, '후보 3개를 모두 소비해야 합니다');
    assert.equal(await textOf(url), 'skipped-bad-port');
});

// ── 3) 포트 충돌은 한정된 횟수로 재시도한다 ──────────────────────────────────────

test('이미 점유된 포트는 EADDRINUSE로 걸러지고 다음 후보에 실제로 bind한다', async (t) => {
    // 실제로 포트를 점유하는 서버를 먼저 띄운다(가짜 오류를 주입하지 않는다).
    const blocker = makeServer(t, 'blocker');
    const { port: takenPort } = await listenOnFetchablePort(blocker);

    const server = makeServer(t, 'after-conflict');
    const free = otherFetchableHighPort(takenPort);
    const candidates = [takenPort, takenPort, free];
    let index = 0;

    const { port, url, attempts } = await listenOnFetchablePort(server, {
        maxAttempts: candidates.length,
        pickPort: () => candidates[index++],
    });

    assert.equal(port, free);
    assert.notEqual(port, takenPort);
    assert.equal(attempts, 3, '충돌 2회 뒤 세 번째 후보에 bind해야 합니다');

    // 점유 중이던 서버는 그대로 살아 있다 — helper가 남의 소켓을 닫거나 가로채지 않는다.
    assert.equal(blocker.address().port, takenPort);
    assert.equal(await textOf(`http://127.0.0.1:${takenPort}`), 'blocker');
    assert.equal(await textOf(url), 'after-conflict');
});

test('상한을 넘도록 충돌하면 성공한 척하지 않고 실패하며, 서버는 listen 상태로 남지 않는다', async (t) => {
    const blocker = makeServer(t, 'blocker');
    const { port: takenPort } = await listenOnFetchablePort(blocker);

    const server = makeServer(t);
    let picks = 0;

    await assert.rejects(
        () => listenOnFetchablePort(server, {
            maxAttempts: 3,
            pickPort: () => { picks += 1; return takenPort; },
        }),
        /3회 시도 안에 bind하지 못했습니다/,
    );

    assert.equal(picks, 3, '재시도는 maxAttempts로 한정되어야 합니다(무한 재시도 금지)');
    assert.equal(isListening(server), false, '실패한 서버가 어딘가에 bind된 채 남으면 안 됩니다');
});

test('maxAttempts가 1 미만이면 즉시 거부한다', async (t) => {
    const server = makeServer(t);
    await assert.rejects(() => listenOnFetchablePort(server, { maxAttempts: 0 }), /maxAttempts/);
    assert.equal(isListening(server), false);
});

test('포트를 바꿔도 해결되지 않는 bind 오류는 감추지 않고 그대로 전파한다', async (t) => {
    // 이미 listen 중인 서버를 또 listen하면 ERR_SERVER_ALREADY_LISTEN이다 — 포트 충돌이
    // 아니므로 재시도로 삼켜서는 안 된다("bind하지 못했습니다" 래퍼로 바뀌면 원인이 숨는다).
    const server = makeServer(t);
    await listenOnFetchablePort(server);

    await assert.rejects(
        () => listenOnFetchablePort(server, { maxAttempts: 5 }),
        (error) => {
            assert.equal(error.code, 'ERR_SERVER_ALREADY_LISTEN');
            assert.doesNotMatch(String(error.message), /bind하지 못했습니다/);
            return true;
        },
    );
});

// ── 4) 정리 — 닫으면 포트가 실제로 풀린다 ────────────────────────────────────────

test('close하면 helper가 잡았던 포트가 실제로 풀려 다음 서버가 같은 포트를 쓸 수 있다', async (t) => {
    const first = makeServer(t, 'first');
    const { port } = await listenOnFetchablePort(first);
    assert.equal(await isPortFree(port), false, 'bind 중에는 점유되어 있어야 합니다');

    first.closeAllConnections?.();
    await new Promise((resolve) => first.close(() => resolve()));
    assert.equal(isListening(first), false);
    assert.equal(await isPortFree(port), true, 'close 후에는 포트가 풀려야 합니다');

    // 같은 포트를 두 번째 서버가 실제로 다시 쓸 수 있다.
    const second = makeServer(t, 'second');
    const { port: reused } = await listenOnFetchablePort(second, { maxAttempts: 1, pickPort: () => port });
    assert.equal(reused, port);
    assert.equal(await textOf(`http://127.0.0.1:${port}`), 'second');
});
