// 로그 파일 도구, 날짜별 파일(logs/app-YYYY-MM-DD.log, SERVER_ID 넣으면 app-<id>-날짜.log)에 줄 모아 남기기 + 오래된 파일 정리 + 비밀값 가리기
// index.js가 켤 때 만들어 요청 로그(morgan)·console 출력을 같이 남김 (새 패키지 없이 Node 기본만)
const fs   = require("fs");
const path = require("path");
const util = require("util");

// 정리 대상 파일 이름 (이 모양 아닌 파일은 안 건드림), 가운데 SERVER_ID는 있어도 없어도 됨
// 같은 폴더에 pm2 Node 여럿이 써도 서로 날짜 지난 파일만 지움 (보관 일수가 같아서 괜찮음)
const FILE_PATTERN = /^app-(?:[A-Za-z0-9_.-]+-)?(\d{4}-\d{2}-\d{2})\.log$/;
// 파일 이름: serverId 있으면 app-<id>-날짜.log (같은 기계 Node끼리 안 겹치게, 8-4장)
const fileNameFor = (key, serverId) => (serverId ? `app-${serverId}-${key}.log` : `app-${key}.log`);
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_DIR = path.join(__dirname, "..", "logs");

// 서버 시각 기준 날짜 글자 (자정 넘으면 새 파일)
const toDateKey = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// 비밀값 가리기: 비번·토큰·쿠키·키 값, Bearer 값, JWT 모양, 접속 주소 안 비번
const SECRET_KEY_PATTERN =
    /((?:password|passwd|pwd|token|accesstoken|refreshtoken|secret|cookie|set-cookie|authorization|api[_-]?key|x-internal-key)["']?\s*[:=]\s*["']?)([^"'\s,;&}]+)/gi;
// 가릴 것이 있을 만한 줄인지 먼저 한 번만 봄 (아래 정규식 4개가 걸 수 있는 낱말을 다 담음, 대부분 줄은 여기서 끝)
const MAYBE_SECRET = /bearer|eyj|:\/\/|pass|pwd|token|secret|cookie|authorization|api|key/i;
const maskSecrets = (text) => (MAYBE_SECRET.test(String(text)) ? maskAll(String(text)) : String(text));
const maskAll = (text) => text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer [REDACTED]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED_JWT]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(SECRET_KEY_PATTERN, "$1[REDACTED]");

// 양수 정수만, 아니면 기본값
const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

// 모아 쓰기: 줄을 모았다가 FLUSH_DELAY_MS 뒤(또는 FLUSH_MAX_BYTES 넘으면 바로) 한 번에 씀
// 줄마다 쓰면 50판에서 1초 수백 번 쓰기 (부하시험.md 8번), 끄기·예상 못 한 오류 땐 close()·exit가 남은 줄 다 씀
const FLUSH_DELAY_MS = 200;
const FLUSH_MAX_BYTES = 64 * 1024;
// 파일 못 열면(권한 등) 이만큼 쉬었다 다시 열어 봄 (전엔 줄마다 다시 열기 → CPU 3%)
const REOPEN_DELAY_MS = 60 * 1000;

// 보관 일수 지난 파일 지우기 (오늘 포함 retentionDays일만 남김)
const removeOldFiles = (dir, retentionDays, today) => {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
    const cutoffKey = toDateKey(cutoff);
    const removed = [];
    for (const name of fs.readdirSync(dir)) {
        const match = FILE_PATTERN.exec(name);
        if (!match || match[1] >= cutoffKey) continue;
        try {
            fs.unlinkSync(path.join(dir, name));
            removed.push(name);
        } catch { /* 지우기 실패는 다음 정리 때 다시 */ }
    }
    return removed;
};

// 로그 파일 자체 문제 알림은 표준 오류로만 (console로 쓰면 다시 로그 파일로 돌아옴)
const writeStderr = (message) => {
    try { process.stderr.write(`${message}\n`); } catch { /* 표준 오류도 못 쓰면 그만 */ }
};

// 파일에 남길 한 줄: 시각 + 색 글자 뺀 가린 글, 줄바꿈 하나로 맞춤
const formatLine = (at, line) => {
    const raw = String(line);
    // 화면용 색 글자(\x1b[31m 등)는 파일에선 뺌
    // eslint-disable-next-line no-control-regex
    const plain = raw.includes("\x1b") ? raw.replace(/\x1b\[[0-9;]*m/g, "") : raw;
    return `${at.toISOString()} ${maskSecrets(plain).replace(/\s+$/, "")}\n`;
};

// 로그 파일 만들기 (시험이 폴더·보관 일수·시계·쓰기 타이머를 바꿔 넣음)
function createLogFile({
    dir = DEFAULT_DIR, retentionDays = DEFAULT_RETENTION_DAYS, now = () => new Date(), serverId = null,
    flushDelayMs = FLUSH_DELAY_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
    reportError = writeStderr,
} = {}) {
    fs.mkdirSync(dir, { recursive: true });
    let fd = null;
    let currentKey = null;
    let buffer = [];
    let bufferBytes = 0;
    let flushTimer = null;
    let openFailedUntil = 0;

    const cleanup = () => removeOldFiles(dir, retentionDays, now());

    // 모은 줄 지금 파일에 한 번에 (동기, 실패해도 서버는 안 멈춤)
    const flush = () => {
        if (flushTimer !== null) {
            clearTimeoutFn(flushTimer);
            flushTimer = null;
        }
        if (buffer.length === 0) return;
        const text = buffer.join("");
        buffer = [];
        bufferBytes = 0;
        if (fd === null) return;
        try { fs.writeSync(fd, text); } catch { /* 디스크 문제는 화면 로그로만 */ }
    };

    // 날짜 바뀌면 모은 줄 옛 파일에 쓰고 닫은 뒤 새 파일 열기 + 정리, 못 열면 REOPEN_DELAY_MS 동안 안 열어 봄
    const openFor = (key, atMs) => {
        flush();
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* 이미 닫힘 */ }
            fd = null;
        }
        currentKey = key;
        try {
            fd = fs.openSync(path.join(dir, fileNameFor(key, serverId)), "a");
            openFailedUntil = 0;
        } catch (error) {
            openFailedUntil = atMs + REOPEN_DELAY_MS;
            reportError(`[LOG] 로그 파일을 못 엶 — ${REOPEN_DELAY_MS / 1000}초 뒤 다시 열어 봄: ${error.code ?? error.message}`);
            return;
        }
        try { cleanup(); } catch { /* 정리 실패는 다음 날 다시 */ }
    };

    // 한 줄 쓰기: 시각 + 가린 글, 줄바꿈 하나로 맞춤 → 모아 두고 조금 뒤 한 번에 씀
    const write = (line) => {
        try {
            const at = now();
            const atMs = at.getTime();
            const key = toDateKey(at);
            if (key !== currentKey || (fd === null && atMs >= openFailedUntil)) openFor(key, atMs);
            // 파일 못 여는 동안은 버림 (화면 로그엔 그대로 나감)
            if (fd === null) return;
            const entry = formatLine(at, line);
            buffer.push(entry);
            bufferBytes += entry.length;
            if (bufferBytes >= FLUSH_MAX_BYTES) {
                flush();
                return;
            }
            if (flushTimer === null) {
                flushTimer = setTimeoutFn(flush, flushDelayMs);
                flushTimer?.unref?.();
            }
        } catch { /* 디스크 문제는 화면 로그로만 */ }
    };

    // 남은 줄 다 쓰고 닫기 (끄기 처리·exit가 부름, 여러 번 불러도 됨)
    const close = () => {
        flush();
        if (fd === null) return;
        try { fs.closeSync(fd); } catch { /* 이미 닫힘 */ }
        fd = null;
        currentKey = null;
    };

    return {
        dir,
        write,
        flush,
        cleanup,
        close,
        currentFile: () => (currentKey ? path.join(dir, fileNameFor(currentKey, serverId)) : null),
    };
}

// SERVER_ID를 직접 넣었을 때만 그 이름 (안 넣은 단일 서버는 파일 이름이 예전 그대로)
const explicitServerId = (env = process.env) => {
    const raw = typeof env.SERVER_ID === "string" ? env.SERVER_ID.trim() : "";
    return require("../config/serverId").SERVER_ID_PATTERN.test(raw) ? raw : null;
};

// 환경값으로 만들기: LOG_DIR=off면 끔, 폴더를 못 만들면 경고만 하고 끔 (서버는 켬)
function createLogFileFromEnv(env = process.env, warn = console.warn) {
    if (String(env.LOG_DIR ?? "").trim().toLowerCase() === "off") return null;
    const dir = env.LOG_DIR && env.LOG_DIR.trim() ? path.resolve(env.LOG_DIR.trim()) : DEFAULT_DIR;
    try {
        const logFile = createLogFile({
            dir, retentionDays: toPositiveInt(env.LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS), serverId: explicitServerId(env),
        });
        // process.exit 바로 부르는 길(켜기 실패 등)도 모은 줄 다 쓰고 끝나게
        process.once("exit", () => logFile.close());
        return logFile;
    } catch (error) {
        warn(`[LOG] 로그 파일을 못 엶 — 화면 로그만 씀: ${error.code ?? error.message}`);
        return null;
    }
}

// console 출력도 파일에 같이 (원래 출력은 그대로), 되돌리는 함수 돌려줌
function teeConsoleToLogFile(logFile, target = console) {
    const levels = { log: "INFO", info: "INFO", warn: "WARN", error: "ERROR" };
    const originals = {};
    for (const [method, level] of Object.entries(levels)) {
        originals[method] = target[method];
        target[method] = (...args) => {
            originals[method].apply(target, args);
            logFile.write(`[${level}] ${util.format(...args)}`);
        };
    }
    return () => Object.assign(target, originals);
}

// console 줄 앞에 [n2] 붙이기 (Node 여러 개 로그를 한 화면에서 가르기, 8-4장), 되돌리는 함수 돌려줌
// 로그 파일 tee 다음에 붙여야(바깥에서 감싸야) 파일 줄에도 들어감
function prefixConsoleWithServerId(serverId, target = console) {
    const tag = `[${serverId}]`;
    const originals = {};
    for (const method of ["log", "info", "warn", "error"]) {
        originals[method] = target[method];
        target[method] = (...args) => originals[method].apply(target, [tag, ...args]);
    }
    return () => Object.assign(target, originals);
}

module.exports = {
    FILE_PATTERN,
    fileNameFor,
    explicitServerId,
    prefixConsoleWithServerId,
    FLUSH_DELAY_MS,
    REOPEN_DELAY_MS,
    DEFAULT_RETENTION_DAYS,
    toDateKey,
    maskSecrets,
    createLogFile,
    createLogFileFromEnv,
    teeConsoleToLogFile,
};
