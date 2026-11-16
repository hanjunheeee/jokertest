// 부하 시험 대상 주소·DB 검사 파일, 로컬이면 그냥 / 로컬 아니면 깃발·계정 파일 있어야 / 운영 목록·개발 서버 포트·개발 DB면 무조건 거부
// run.js·dbcount.js가 시험 시작 전에 부름 (계정 만들기·접속 전에 막음)

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REMOTE_FLAG = "--i-know-this-is-not-production";

// 사용자가 손으로 켜 두는 개발 서버 포트, 로컬 대상이 이 포트면 늘 거부 (개발 서버·개발 DB에 부하가 걸림)
const DEV_SERVER_PORT = "4000";
// 개발 DB 이름, 무슨 설정을 줘도 거부 (시험 계정을 만들고 지우는 곳이라 진짜 자료가 섞임)
const BLOCKED_DB_NAMES = Object.freeze(["joker", "joker_realgame"]);
// 시험 계정을 만들어도 되는 DB 이름 (브라우저 시험 DB·부하 전용 DB), 그 밖은 --allow-db로 이름을 직접 줘야 함
const ALLOWED_DB_NAMES = Object.freeze(["joker_e2e", "joker_loadtest"]);

// 주소 → URL (http·https만), 끝 슬래시 뺀 origin
function parseTarget(raw) {
    let url;
    try { url = new URL(String(raw)); } catch { throw new Error(`대상 주소 모양이 틀림: ${raw}`); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("대상 주소는 http:// 또는 https://");
    return { url, origin: url.origin };
}

const isLocalHost = (hostname) => LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");

// 운영 목록: 쉼표로 나눈 주소 또는 호스트 이름 (예: https://mmc.example.com,api.mmc.example.com)
function parseBlockedList(raw) {
    return String(raw ?? "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
        try { return new URL(item.includes("://") ? item : `https://${item}`).hostname.toLowerCase(); } catch { return item.toLowerCase(); }
    });
}

// 돌려도 되는지 판단, 안 되면 던짐
function checkTargetAllowed({ target, allowRemote = false, accountsFile = null, blocked = "" }) {
    const { url, origin } = parseTarget(target);
    const hostname = url.hostname.toLowerCase();
    if (parseBlockedList(blocked).includes(hostname)) {
        throw new Error(`운영 주소 목록(LOADTEST_BLOCKED_TARGETS)에 있는 주소라 거부: ${hostname}`);
    }
    const local = isLocalHost(hostname);
    if (local && url.port === DEV_SERVER_PORT) {
        throw new Error(`${DEV_SERVER_PORT}번은 개발 서버 포트라 거부 (시험 서버는 다른 포트로 띄움)`);
    }
    if (!local) {
        if (!allowRemote) throw new Error(`로컬 아닌 주소는 ${REMOTE_FLAG} 깃발이 있어야 돎: ${hostname}`);
        if (!accountsFile) throw new Error("로컬 아닌 주소는 미리 만든 계정 목록 파일(--accounts)이 있어야 돎");
    }
    return { origin, local };
}

// DB 주소에서 DB 이름만 꺼냄 (비번은 안 건드림) → 'joker_e2e'
function databaseNameOf(databaseUrl) {
    let url;
    try { url = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL 모양이 틀림"); }
    return decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
}

// 시험 계정을 만들 DB 검사: 운영 아님 → 로컬 호스트 → 개발 DB 이름 아님 → 허용 이름(또는 --allow-db로 준 이름)
// 통과면 DB 이름 돌려줌
function assertLocalDatabase(databaseUrl, nodeEnv, { allowDbNames = [] } = {}) {
    if (nodeEnv === "production") throw new Error("NODE_ENV=production에선 시험 계정을 안 만듦");
    let host;
    try { host = new URL(databaseUrl).hostname.toLowerCase(); } catch { throw new Error("DATABASE_URL 모양이 틀림"); }
    if (!isLocalHost(host)) throw new Error(`시험 계정은 로컬 DB에만 만듦 (지금 DB 호스트: ${host})`);
    const name = databaseNameOf(databaseUrl);
    if (BLOCKED_DB_NAMES.includes(name.toLowerCase())) {
        throw new Error(`개발 DB(${name})엔 부하 시험을 안 붙임 → --db-env ../e2e/.env.e2e 처럼 시험 DB 값을 줌`);
    }
    const allowed = [...ALLOWED_DB_NAMES, ...allowDbNames.map((item) => String(item).trim()).filter(Boolean)];
    if (!allowed.includes(name)) {
        throw new Error(`시험 DB 이름이 아님(${name || "이름 없음"}) → 허용: ${ALLOWED_DB_NAMES.join(", ")} (다른 시험 DB면 --allow-db <이름>)`);
    }
    return name;
}

// 환경값 파일(KEY=VALUE 줄)에서 고른 이름만 읽음 (다른 비밀값은 안 꺼냄) → { DATABASE_URL: '…' }
function readEnvValues(filePath, names) {
    const fs = require("fs");
    const out = {};
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && names.includes(m[1])) out[m[1]] = m[2].trim();
    }
    return out;
}

// 소켓에 붙일 Origin: 준 값 있으면 그 origin, 없으면 로컬 아닌 대상만 대상 주소 (운영 서버는 Origin 없는 소켓 거절, DP-034)
// 로컬은 안 붙임 (개발 서버는 Origin 없어도 받음)
function resolveOriginHeader({ frontendOrigin = "", targetOrigin, local }) {
    if (frontendOrigin) return parseTarget(frontendOrigin).origin;
    return local ? null : targetOrigin;
}

module.exports = {
    REMOTE_FLAG, DEV_SERVER_PORT, BLOCKED_DB_NAMES, ALLOWED_DB_NAMES,
    parseTarget, parseBlockedList, checkTargetAllowed, assertLocalDatabase, databaseNameOf, readEnvValues, isLocalHost, resolveOriginHeader,
};
