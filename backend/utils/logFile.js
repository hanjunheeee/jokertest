// 로그 파일 도구, 날짜별 파일(logs/app-YYYY-MM-DD.log)에 한 줄씩 남기기 + 오래된 파일 정리 + 비밀값 가리기
// index.js가 켤 때 만들어 요청 로그(morgan)·console 출력을 같이 남김 (새 패키지 없이 Node 기본만)
const fs   = require("fs");
const path = require("path");
const util = require("util");

// 정리 대상 파일 이름 (이 모양 아닌 파일은 안 건드림)
const FILE_PATTERN = /^app-(\d{4}-\d{2}-\d{2})\.log$/;
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
const maskSecrets = (text) => String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer [REDACTED]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED_JWT]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(SECRET_KEY_PATTERN, "$1[REDACTED]");

// 양수 정수만, 아니면 기본값
const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

// 로그 파일 만들기 (시험이 폴더·보관 일수·시계를 바꿔 넣음)
// 쓰기는 동기: 바로 종료(process.exit)·예상 못 한 오류 때도 마지막 줄이 안 사라지게
function createLogFile({ dir = DEFAULT_DIR, retentionDays = DEFAULT_RETENTION_DAYS, now = () => new Date() } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    let fd = null;
    let currentKey = null;

    // 보관 일수 지난 파일 지우기 (오늘 포함 retentionDays일만 남김)
    const cleanup = () => {
        const cutoff = now();
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

    // 날짜 바뀌면 옛 파일 닫고 새 파일 열기 + 정리
    const openFor = (key) => {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* 이미 닫힘 */ }
        }
        fd = fs.openSync(path.join(dir, `app-${key}.log`), "a");
        currentKey = key;
        cleanup();
    };

    // 한 줄 쓰기: 시각 + 가린 글, 줄바꿈 하나로 맞춤 (쓰기 실패해도 서버는 안 멈춤)
    const write = (line) => {
        try {
            const at = now();
            const key = toDateKey(at);
            if (key !== currentKey) openFor(key);
            // 화면용 색 글자(\x1b[31m 등)는 파일에선 뺌
            // eslint-disable-next-line no-control-regex
            const text = maskSecrets(String(line).replace(/\x1b\[[0-9;]*m/g, "")).replace(/\s+$/, "");
            fs.writeSync(fd, `${at.toISOString()} ${text}\n`);
        } catch { /* 디스크 문제는 화면 로그로만 */ }
    };

    const close = () => {
        if (fd === null) return;
        try { fs.closeSync(fd); } catch { /* 이미 닫힘 */ }
        fd = null;
        currentKey = null;
    };

    return {
        dir,
        write,
        cleanup,
        close,
        currentFile: () => (currentKey ? path.join(dir, `app-${currentKey}.log`) : null),
    };
}

// 환경값으로 만들기: LOG_DIR=off면 끔, 폴더를 못 만들면 경고만 하고 끔 (서버는 켬)
function createLogFileFromEnv(env = process.env, warn = console.warn) {
    if (String(env.LOG_DIR ?? "").trim().toLowerCase() === "off") return null;
    const dir = env.LOG_DIR && env.LOG_DIR.trim() ? path.resolve(env.LOG_DIR.trim()) : DEFAULT_DIR;
    try {
        return createLogFile({ dir, retentionDays: toPositiveInt(env.LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS) });
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

module.exports = {
    FILE_PATTERN,
    DEFAULT_RETENTION_DAYS,
    toDateKey,
    maskSecrets,
    createLogFile,
    createLogFileFromEnv,
    teeConsoleToLogFile,
};
