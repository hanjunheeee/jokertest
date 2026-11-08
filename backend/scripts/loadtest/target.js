// 부하 시험 대상 주소 검사 파일, 로컬이면 그냥 / 로컬 아니면 깃발·계정 파일 있어야 / 운영 목록이면 무조건 거부
// run.js가 시험 시작 전에 부름 (계정 만들기·접속 전에 막음)

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REMOTE_FLAG = "--i-know-this-is-not-production";

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
    if (!local) {
        if (!allowRemote) throw new Error(`로컬 아닌 주소는 ${REMOTE_FLAG} 깃발이 있어야 돎: ${hostname}`);
        if (!accountsFile) throw new Error("로컬 아닌 주소는 미리 만든 계정 목록 파일(--accounts)이 있어야 돎");
    }
    return { origin, local };
}

// 로컬 계정을 만들 DB가 로컬인지 (DATABASE_URL 호스트)
function assertLocalDatabase(databaseUrl, nodeEnv) {
    if (nodeEnv === "production") throw new Error("NODE_ENV=production에선 시험 계정을 안 만듦");
    let host;
    try { host = new URL(databaseUrl).hostname.toLowerCase(); } catch { throw new Error("DATABASE_URL 모양이 틀림"); }
    if (!isLocalHost(host)) throw new Error(`시험 계정은 로컬 DB에만 만듦 (지금 DB 호스트: ${host})`);
}

// 소켓에 붙일 Origin: 준 값 있으면 그 origin, 없으면 로컬 아닌 대상만 대상 주소 (운영 서버는 Origin 없는 소켓 거절, DP-034)
// 로컬은 안 붙임 (개발 서버는 Origin 없어도 받음)
function resolveOriginHeader({ frontendOrigin = "", targetOrigin, local }) {
    if (frontendOrigin) return parseTarget(frontendOrigin).origin;
    return local ? null : targetOrigin;
}

module.exports = { REMOTE_FLAG, parseTarget, parseBlockedList, checkTargetAllowed, assertLocalDatabase, isLocalHost, resolveOriginHeader };
