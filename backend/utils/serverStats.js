// 서버 숫자 모으기 파일, 프로세스 메모리·이벤트 루프 지연·연결 수 (부하 시험·감시용, 개인정보 없음)
// health.routes.js가 내부 열쇠 맞을 때만 실음, Node 여러 개면 cluster 하트비트도 짧은 숫자를 읽음
const { monitorEventLoopDelay } = require("perf_hooks");

let histogram = null;
// 하트비트용 지연 측정은 따로 (하트비트가 비워도 /health 숫자는 안 흔들리게)
let heartbeatHistogram = null;

// 처음 부를 때 지연 측정 켬 (20ms 간격 표본), 안 쓰는 서버엔 부담 없게
const ensureMonitor = () => {
    if (!histogram) {
        histogram = monitorEventLoopDelay({ resolution: 20 });
        histogram.enable();
    }
    return histogram;
};

const toMs = (ns) => Math.round((Number(ns) / 1e6) * 10) / 10;
const toMb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

// 기본 출처: 접속 목록·io·진행 판 장부·대기방 장부
const defaultSources = () => {
    const emitter = require("../socket/emitter");
    return {
        onlineUsers: emitter.onlineUsers,
        io: emitter.getIo(),
        gameSessions: require("../game-core/core/registry/state").gameSessions,
        gameRooms: require("../socket/matchmaking/core/state").gameRooms,
    };
};

// 지난번 읽은 뒤부터의 값 (읽을 때마다 지연 기록 비움 → 단계별로 따로 봄)
// 연결 수 출처는 부를 때 불러 시험이 바꿔 끼움
function collectServerStats({ sources } = {}) {
    const h = ensureMonitor();
    const eventLoopDelayMs = {
        mean: Number.isFinite(h.mean) ? toMs(h.mean) : 0,
        p95: toMs(h.percentile(95) || 0),
        max: toMs(h.max || 0),
    };
    h.reset();

    const memory = process.memoryUsage();
    const { onlineUsers, io, gameSessions } = sources ?? defaultSources();

    return {
        uptimeSec: Math.round(process.uptime()),
        memoryMb: { rss: toMb(memory.rss), heapUsed: toMb(memory.heapUsed), heapTotal: toMb(memory.heapTotal) },
        eventLoopDelayMs,
        connections: {
            onlineUsers: onlineUsers?.size ?? 0,
            engineClients: io?.engine?.clientsCount ?? 0,
            games: gameSessions?.size ?? 0,
        },
    };
}

// 하트비트에 싣는 짧은 숫자 (cluster nodes가 3초마다 부름) → { games, rooms, online, loopP95 }
// 지난번 읽은 뒤부터의 지연 p95 (읽을 때마다 비움)
function collectHeartbeatStats({ sources } = {}) {
    if (!heartbeatHistogram) {
        heartbeatHistogram = monitorEventLoopDelay({ resolution: 20 });
        heartbeatHistogram.enable();
    }
    const loopP95 = toMs(heartbeatHistogram.percentile(95) || 0);
    heartbeatHistogram.reset();
    const { onlineUsers, gameSessions, gameRooms } = sources ?? defaultSources();
    return {
        games: gameSessions?.size ?? 0,
        rooms: gameRooms?.size ?? 0,
        online: onlineUsers?.size ?? 0,
        loopP95,
    };
}

module.exports = { collectServerStats, collectHeartbeatStats, ensureMonitor };
