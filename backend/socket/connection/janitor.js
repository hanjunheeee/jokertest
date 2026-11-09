// 청소 담당 파일, 죽은 Node가 남긴 ONLINE 접속 줄을 OFFLINE으로 바꿈 (Node 여럿 중 잠금 잡은 하나만)
// socket.js initSocket이 startJanitor 한 번 부름, Redis 못 쓰면(단일 모드·down) 아무것도 안 함 (MN-077)
const cluster = require("../../cluster");
const onlinePresenceRepository = require("../../repositories/presence/onlinePresence");

// 30초마다 확인, 잠금 수명 60초 (4-2장 lock:janitor NX EX 60)
const JANITOR_INTERVAL_MS = 30 * 1000;
const JANITOR_LOCK_MS = 60 * 1000;
let timer = null;

// 잠금 잡기: 없으면 잡고, 이미 내 것이면 그대로 씀 → 잡았으면 true
async function holdLock() {
    const key = cluster.directory.keys().lock("janitor");
    if (await cluster.directory.write(key, cluster.serverId(), { ttlMs: JANITOR_LOCK_MS, nx: true })) return true;
    const { value } = await cluster.directory.read(key);
    return value === cluster.serverId();
}

// 한 번 청소 → { ran, changed }
// 막 켜진 Node 줄을 지우지 않게 하트비트가 목록에 잡힐 시간(죽음 판정 + 2주기)보다 오래된 줄만
async function runJanitorOnce({ now = Date.now() } = {}) {
    if (!cluster.isShared()) return { ran: false, changed: 0 };
    if (!(await holdLock())) return { ran: false, changed: 0 };
    await cluster.nodes.refresh();
    const aliveIds = cluster.nodes.list().filter((n) => n.alive).map((n) => n.id);
    const { deadAfterMs, heartbeatMs } = cluster.config();
    const cutoff = new Date(now - (deadAfterMs + heartbeatMs * 2));
    const changed = await onlinePresenceRepository.markOfflineOnDeadServers(aliveIds, cutoff);
    return { ran: true, changed };
}

// 켜기 (여러 번 불러도 하나만), 프로세스 종료를 붙잡지 않게 unref
function startJanitor() {
    if (timer) return;
    timer = setInterval(() => {
        runJanitorOnce().catch((error) => console.warn("[JANITOR] 청소 실패 —", error?.code ?? error?.name ?? "Error"));
    }, JANITOR_INTERVAL_MS);
    timer.unref?.();
}

function stopJanitor() {
    clearInterval(timer);
    timer = null;
}

module.exports = { startJanitor, stopJanitor, runJanitorOnce, JANITOR_INTERVAL_MS, JANITOR_LOCK_MS };
