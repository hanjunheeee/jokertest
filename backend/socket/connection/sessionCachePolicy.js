// 세션 확인 캐시 규칙 파일, 통과 결과를 몇 ms 믿을지 + 이 시각 전 통과는 안 믿는 바닥 시각 (Redis 상태 따라)
// socket/connection/sessionCheck.js가 사건 검사 때 물음, Redis up/down 바뀜은 cluster.onStateChange로 받음
const cluster = require("../../cluster");

// 바닥 시각: Redis가 죽거나 살아난 시각 (그 사이 다른 Node 끊김 방송을 놓쳤을 수 있음 → 그 전 통과는 안 믿음)
let floorAt = -Infinity;

// 통과 결과를 믿는 시간
// - 단일 모드·Redis up: 보통 시간 (끊김은 방송으로 바로 지움)
// - Redis down: SESSION_CACHE_FALLBACK_MS (기본 0 = 캐시 끔, 사건마다 DB, 사용자 결정)
function cacheWindowMs(normalMs) {
    if (cluster.state() !== "down") return normalMs;
    return cluster.config().sessionCacheFallbackMs;
}

// 이 시각 이하에 묻기 시작한 통과는 안 믿음
function cacheFloorAt() {
    return floorAt;
}

// Redis 상태 바뀜: 죽을 때·살아날 때 둘 다 바닥 시각을 지금으로
function onClusterStateChange(next, prev) {
    if (next === prev) return;
    if (next === "down" || (next === "up" && prev === "down")) floorAt = Date.now();
}

cluster.onStateChange(onClusterStateChange);

module.exports = {
    cacheWindowMs,
    cacheFloorAt,
    __testables: { onClusterStateChange, resetFloor: () => { floorAt = -Infinity; } },
};
