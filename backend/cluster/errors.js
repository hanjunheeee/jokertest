// cluster 오류 코드·오류 만들기·조용한 경고 파일
// cluster 안 파일 전부와 memoryCluster가 씀, 다른 조각은 cluster/index.js의 CODES로 받음

// 오류 코드 (4-5장 약속 + RPC·켜기 쪽 추가)
const CODES = Object.freeze({
    CLUSTER_UNAVAILABLE: "CLUSTER_UNAVAILABLE",
    NODE_UNAVAILABLE: "NODE_UNAVAILABLE",
    RPC_TIMEOUT: "RPC_TIMEOUT",
    RPC_UNKNOWN_METHOD: "RPC_UNKNOWN_METHOD",
    RPC_FAILED: "RPC_FAILED",
    DUPLICATE_SERVER_ID: "DUPLICATE_SERVER_ID",
});

// code 달린 오류 만들기
const clusterError = (code, message = code, extra = {}) => Object.assign(new Error(message), { code }, extra);

// 같은 경고 글은 30초에 한 번만 찍음 (Redis 끊긴 동안 0.2~2초마다 다시 붙으며 로그가 넘치는 것 막기)
function createQuietLog(log = console, windowMs = 30000) {
    const lastAt = new Map();
    return (message) => {
        const now = Date.now();
        if (now - (lastAt.get(message) ?? -Infinity) < windowMs) return;
        lastAt.set(message, now);
        log.warn(message);
    };
}

module.exports = { CODES, clusterError, createQuietLog };
