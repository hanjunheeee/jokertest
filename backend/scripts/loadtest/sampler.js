// 부하 시험 서버 숫자 읽기 파일, 시험 동안 서버의 메모리·이벤트 루프 지연·접속 수를 주기로 읽고 최대값으로 요약
// run.js가 시작할 때 켜고 끝에 끔 (서버 2대면 서버마다 따로 읽음)
const { sleep } = require("./bot");

// origins 여러 개면 서버마다 따로 읽음 (앞단을 거치면 번갈아 답해 숫자가 섞임)
function startServerSampler(origins, key, sampleMs) {
    const samples = [];
    if (!key) return { samples, stop: () => {}, latest: () => null, enabled: false };
    let stopped = false;
    const headers = { "x-internal-key": key };
    const tickOne = async (origin) => {
        try {
            const health = await (await fetch(`${origin}/health`, { headers })).json();
            let live = null;
            try {
                const res = await fetch(`${origin}/internal/live`, { headers });
                if (res.ok) live = await res.json();
            } catch { /* 내부 API 없으면 /health만 */ }
            if (health?.server) samples.push({ at: Date.now(), origin, serverId: health.serverId ?? null, ...health.server, live: live?.data ?? live ?? null });
        } catch { /* 한 번 못 읽어도 계속 */ }
    };
    const tick = () => Promise.all(origins.map(tickOne));
    const loop = (async () => { while (!stopped) { await tick(); await sleep(sampleMs); } })();
    return {
        samples,
        enabled: true,
        latest: () => samples[samples.length - 1] ?? null,
        stop: async () => { stopped = true; await loop; },
    };
}

// 표본 묶음 요약: 전체 최대값 + 서버마다(byNode) 최대값, 접속·판 수는 같은 때 서버끼리 더한 값의 최대
const summarizeServer = (samples) => {
    if (samples.length === 0) return null;
    const maxOf = (list, pick) => Math.max(...list.map(pick));
    const summarizeOne = (list) => ({
        rssMbMax: maxOf(list, (s) => s.memoryMb.rss),
        heapUsedMbMax: maxOf(list, (s) => s.memoryMb.heapUsed),
        eventLoopP95MsMax: maxOf(list, (s) => s.eventLoopDelayMs.p95),
        eventLoopMaxMs: maxOf(list, (s) => s.eventLoopDelayMs.max),
        onlineUsersMax: maxOf(list, (s) => s.connections.onlineUsers),
        gamesMax: maxOf(list, (s) => s.connections.games),
    });
    const byOrigin = new Map();
    for (const sample of samples) {
        const key = sample.origin ?? "server";
        if (!byOrigin.has(key)) byOrigin.set(key, []);
        byOrigin.get(key).push(sample);
    }
    const summary = summarizeOne(samples);
    if (byOrigin.size > 1) {
        summary.byNode = Object.fromEntries([...byOrigin].map(([origin, list]) => [list[0].serverId ?? origin, summarizeOne(list)]));
        const nodes = Object.values(summary.byNode);
        summary.onlineUsersMax = nodes.reduce((sum, node) => sum + node.onlineUsersMax, 0);
        summary.gamesMax = nodes.reduce((sum, node) => sum + node.gamesMax, 0);
    }
    return summary;
};

module.exports = { startServerSampler, summarizeServer };
