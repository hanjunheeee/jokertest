'use strict';

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

const isPortFree = (port) => new Promise((resolve) => {
    const probe = http.createServer(() => {});
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
});

const otherFetchableHighPort = (...excluded) => {
    for (;;) {
        const port = randomFetchableHighPort();
        if (!excluded.includes(port)) return port;
    }
};

const textOf = async (url) => (await fetch(url)).text();

test('helper가 bind한 서버는 고포트 범위의 Fetch 허용 포트에서 실제 fetch에 응답한다', async (t) => {
    const server = makeServer(t, 'helper-real-http');
    const { port, host, url, attempts } = await listenOnFetchablePort(server);

    assert.equal(host, '127.0.0.1');
    assert.ok(port >= HIGH_PORT_MIN && port <= HIGH_PORT_MAX, `고포트 범위 밖입니다: ${port}`);
    assert.equal(FETCH_BAD_PORTS.has(port), false, `Fetch 금지 포트에 bind했습니다: ${port}`);
    assert.equal(url, `http://127.0.0.1:${port}`);
    assert.equal(attempts, 1);
    assert.equal(server.address().port, port);

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

test('무작위 포트 선택기는 언제나 고포트 범위의 허용 포트만 돌려준다', () => {
    for (let i = 0; i < 2000; i += 1) {
        const port = randomFetchableHighPort();
        assert.ok(port >= HIGH_PORT_MIN && port <= HIGH_PORT_MAX, `범위 밖: ${port}`);
        assert.equal(FETCH_BAD_PORTS.has(port), false, `금지 포트를 골랐습니다: ${port}`);
    }
});

test('실제 실패했던 금지 포트(2049·6697)는 허용 판정에서 거부된다', () => {
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

test('이미 점유된 포트는 EADDRINUSE로 걸러지고 다음 후보에 실제로 bind한다', async (t) => {
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

test('close하면 helper가 잡았던 포트가 실제로 풀려 다음 서버가 같은 포트를 쓸 수 있다', async (t) => {
    const first = makeServer(t, 'first');
    const { port } = await listenOnFetchablePort(first);
    assert.equal(await isPortFree(port), false, 'bind 중에는 점유되어 있어야 합니다');

    first.closeAllConnections?.();
    await new Promise((resolve) => first.close(() => resolve()));
    assert.equal(isListening(first), false);
    assert.equal(await isPortFree(port), true, 'close 후에는 포트가 풀려야 합니다');

    const second = makeServer(t, 'second');
    const { port: reused } = await listenOnFetchablePort(second, { maxAttempts: 1, pickPort: () => port });
    assert.equal(reused, port);
    assert.equal(await textOf(`http://127.0.0.1:${port}`), 'second');
});
