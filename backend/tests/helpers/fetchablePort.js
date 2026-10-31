'use strict';

const FETCH_BAD_PORTS = Object.freeze(new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389,
    427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636,
    989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
    6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]));

const HIGH_PORT_MIN = 49152;
const HIGH_PORT_MAX = 65535;

const DEFAULT_MAX_ATTEMPTS = 40;

const RETRYABLE_LISTEN_ERRORS = new Set(['EADDRINUSE', 'EACCES']);

const isFetchablePort = (port) =>
    Number.isInteger(port) && port > 0 && port <= HIGH_PORT_MAX && !FETCH_BAD_PORTS.has(port);

const randomFetchableHighPort = () => {
    for (;;) {
        const port = HIGH_PORT_MIN + Math.floor(Math.random() * (HIGH_PORT_MAX - HIGH_PORT_MIN + 1));
        if (isFetchablePort(port)) return port;
    }
};

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
    server.close(() => resolve());
});

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
            await closeQuietly(server);
            lastError = new Error(`bind된 포트가 Fetch 금지 포트입니다: ${actual}`);
            continue;
        }

        return { port: actual, host, url: `http://${host}:${actual}`, attempts: attempt };
    }

    const reason = lastError ? `${lastError.code ?? lastError.name ?? 'Error'}: ${lastError.message}` : '원인 미상';
    throw new Error(`Fetch 허용 포트에 ${maxAttempts}회 시도 안에 bind하지 못했습니다 (마지막 원인 — ${reason})`);
};

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
