'use strict';

// 시험용 로컬 HTTP 서버를 **전역 fetch가 실제로 접속할 수 있는 포트**에 bind하는 공용 helper.
//
// 왜 필요한가:
//   Fetch 표준은 고전적으로 위험한 포트 목록("bad port")을 두고, undici(Node의 전역 fetch)는
//   그 포트로의 요청을 연결 시도조차 하지 않고 `TypeError: fetch failed` + `cause: bad port`로
//   즉시 거부한다. 그런데 이 개발 장비의 Windows TCP 동적 포트 범위는 1024..15000이고
//   (netsh int ipv4 show dynamicport tcp), 그 구간에는 2049·6697·10080 같은 금지 포트가 여럿
//   들어 있다. 그래서 `server.listen(0)`이 운에 따라 금지 포트를 받아 오면, 서버는 정상적으로
//   떠 있는데 시험의 fetch만 "bad port"로 죽는다 — 실제로 2026-09-22 전체 실행에서
//   f07(fixture가 127.0.0.1:2049)과 f32a(앱 서버가 127.0.0.1:6697)가 이 이유로 실패했다.
//
// 어떻게 고치는가:
//   포트를 0에 맡기지 않고, 금지 목록과 겹치지 않는 고포트 범위(49152..65535, IANA 동적/사설
//   범위)에서 하나를 골라 **실제로 쓸 그 서버를 직접 bind**한다. 이미 쓰이는 포트면
//   EADDRINUSE가 나므로 한정된 횟수만큼 다른 포트로 다시 시도한다.
//
//   "빈 포트를 미리 찾아 두었다가 닫고 그 번호를 넘겨주는" 방식은 쓰지 않는다 — 탐색과 실제
//   bind 사이에 다른 프로세스가 그 포트를 채가는 경쟁(TOCTOU)이 생긴다. 여기서는 호출자가
//   넘긴 서버 자신이 곧바로 bind하므로 그 틈이 없다.
//
//   금지 목록을 무력화하거나(undici 옵션 조작 등) OS 전역 포트 범위를 바꾸지 않는다. 시험은
//   여전히 실제 loopback TCP에 bind하고 실제 HTTP로 왕복한다.

/** Fetch 표준의 bad port 목록(WHATWG Fetch "bad ports"). undici가 이 포트로의 요청을 거부한다. */
const FETCH_BAD_PORTS = Object.freeze(new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389,
    427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636,
    989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
    6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]));

/** IANA 동적/사설 포트 범위. 금지 목록의 최댓값(10080)보다 한참 위라 겹치지 않는다. */
const HIGH_PORT_MIN = 49152;
const HIGH_PORT_MAX = 65535;

/** 포트 충돌 재시도 횟수 상한 — 무한 재시도로 시험이 멈추지 않게 한정한다. */
const DEFAULT_MAX_ATTEMPTS = 40;

/** bind 실패 중 "다른 포트로 다시 해 보면 되는" 것만 재시도한다. EADDRINUSE는 그 포트가
 *  점유됐다는 뜻이고, Windows의 제외 포트 범위는 EACCES로 거부되므로 둘 다 다른 포트면
 *  해결된다. 반대로 EADDRNOTAVAIL(그 주소 자체가 이 장비 것이 아님)이나
 *  ERR_SERVER_ALREADY_LISTEN 같은 오류는 포트를 바꿔도 달라지지 않는 호출자의 잘못이므로
 *  감추지 않고 그대로 던진다. */
const RETRYABLE_LISTEN_ERRORS = new Set(['EADDRINUSE', 'EACCES']);

const isFetchablePort = (port) =>
    Number.isInteger(port) && port > 0 && port <= HIGH_PORT_MAX && !FETCH_BAD_PORTS.has(port);

/** 고포트 범위에서 Fetch가 허용하는 포트 하나를 무작위로 고른다. */
const randomFetchableHighPort = () => {
    for (;;) {
        const port = HIGH_PORT_MIN + Math.floor(Math.random() * (HIGH_PORT_MAX - HIGH_PORT_MIN + 1));
        if (isFetchablePort(port)) return port;
    }
};

/** server.listen(port, host)을 한 번 시도하고 listening 또는 error 중 먼저 오는 쪽으로 끝낸다.
 *  두 리스너를 모두 떼어내므로 재시도해도 리스너가 쌓이지 않는다. */
const listenOnce = (server, port, host) => new Promise((resolve, reject) => {
    const cleanup = () => {
        server.removeListener('listening', onListening);
        server.removeListener('error', onError);
    };
    const onListening = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(port, host);
});

const closeQuietly = (server) => new Promise((resolve) => {
    // 아직 listen 중이 아니면 close 콜백이 ERR_SERVER_NOT_RUNNING을 주지만, 여기서는
    // "닫혀 있다"는 결과만 필요하므로 그대로 넘어간다.
    server.close(() => resolve());
});

/**
 * 넘겨받은 서버를 Fetch 허용 포트에 실제로 bind한다.
 *
 * @param {import('node:net').Server} server 호출자가 만든 실제 서버(http.createServer/app.listen 대상)
 * @param {{ host?: string, maxAttempts?: number, pickPort?: () => number }} [options]
 *        pickPort는 시험이 충돌·금지 포트 경로를 재현하기 위해서만 주입한다(기본은 무작위 고포트).
 * @returns {Promise<{ port: number, host: string, url: string, attempts: number }>}
 */
const listenOnFetchablePort = async (server, options = {}) => {
    const {
        host = '127.0.0.1',
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        pickPort = randomFetchableHighPort,
    } = options;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new Error(`maxAttempts는 1 이상의 정수여야 합니다: ${maxAttempts}`);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const candidate = pickPort();

        if (!isFetchablePort(candidate)) {
            // 주입된 pickPort가 금지 포트를 골랐다면 bind조차 하지 않고 다음 후보로 넘어간다.
            lastError = new Error(`Fetch 금지 포트라 건너뜁니다: ${candidate}`);
            continue;
        }

        try {
            await listenOnce(server, candidate, host);
        } catch (error) {
            if (!RETRYABLE_LISTEN_ERRORS.has(error?.code)) throw error;
            lastError = error;
            continue;
        }

        const actual = server.address()?.port;
        if (!isFetchablePort(actual)) {
            // 실제 bind 결과가 요청과 다르거나 금지 포트면 그 소켓을 닫고 다시 고른다.
            await closeQuietly(server);
            lastError = new Error(`bind된 포트가 Fetch 금지 포트입니다: ${actual}`);
            continue;
        }

        return { port: actual, host, url: `http://${host}:${actual}`, attempts: attempt };
    }

    const reason = lastError ? `${lastError.code ?? lastError.name ?? 'Error'}: ${lastError.message}` : '원인 미상';
    throw new Error(`Fetch 허용 포트에 ${maxAttempts}회 시도 안에 bind하지 못했습니다 (마지막 원인 — ${reason})`);
};

/** listenOnFetchablePort의 편의 형태 — 호출부 대부분이 필요로 하는 base URL만 돌려준다. */
const listenOnFetchableUrl = async (server, options) => (await listenOnFetchablePort(server, options)).url;

module.exports = {
    FETCH_BAD_PORTS,
    HIGH_PORT_MIN,
    HIGH_PORT_MAX,
    DEFAULT_MAX_ATTEMPTS,
    isFetchablePort,
    randomFetchableHighPort,
    listenOnFetchablePort,
    listenOnFetchableUrl,
};
