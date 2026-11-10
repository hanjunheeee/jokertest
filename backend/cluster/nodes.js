// Node 목록 파일, 하트비트(`node:<id>` hash, 3초마다·10초 수명)와 살아 있는 Node 보기, 같은 이름 두 번 켜기 막기
// cluster/index.js가 만들어 nodes.list·isAlive·setDraining으로 내보냄, /internal/cluster(조각 2)·길잡이(조각 3)가 읽음
const { CODES, clusterError } = require("./errors");

// hash 글자 → 숫자·참거짓으로
const parseInfo = (id, raw) => ({
    id,
    bootEpoch: raw.bootEpoch || null,
    startedAt: Number(raw.startedAt) || null,
    draining: raw.draining === "1",
    games: Number(raw.games) || 0,
    rooms: Number(raw.rooms) || 0,
    online: Number(raw.online) || 0,
    loopP95: Number(raw.loopP95) || 0,
    version: raw.version || "",
    lastSeen: Number(raw.lastSeen) || null,
});

const up = (c) => Boolean(c.backend) && c.backend.state() === "up";

// 내 정보 한 줄 (하트비트 hash·list 첫째)
function selfInfo(c) {
    let s = {};
    try { s = c.statsProvider() ?? {}; } catch { /* 숫자 못 읽어도 하트비트는 감 */ }
    return {
        id: c.serverId, bootEpoch: c.bootEpoch, startedAt: c.startedAt, draining: c.st.draining, version: c.version,
        lastSeen: c.now(), games: Number(s.games) || 0, rooms: Number(s.rooms) || 0,
        online: Number(s.online) || 0, loopP95: Number(s.loopP95) || 0,
    };
}

// 다른 Node 목록 다시 읽기: 수명(deadAfterMs) 지나 없어진 hash는 죽음 → 집합에서도 뺌
// 죽음 판정은 Redis 수명으로만 함 (기계마다 시계가 달라도 안 틀리게)
async function refresh(c) {
    if (!up(c)) return;
    const ids = (await c.backend.ops.smembers(c.setKey)).filter((id) => id !== c.serverId);
    const rows = ids.length ? await c.backend.ops.hgetallMany(ids.map(c.nodeKey)) : [];
    const next = new Map();
    ids.forEach((id, i) => {
        const raw = rows[i];
        if (!raw || !raw.bootEpoch) { c.backend.ops.srem(c.setKey, id).catch(() => {}); return; }
        next.set(id, parseInfo(id, raw));
    });
    c.st.others = next;
}

// 하트비트 한 번: 내 hash 쓰기 → 없어졌었으면(Redis 재시작·비움·오래 끊김) onLost, 남의 bootEpoch면 같은 이름 경고
async function beat(c) {
    if (!up(c)) return;
    const { id, ...info } = selfInfo(c);
    const fields = { ...info, draining: info.draining ? "1" : "0" };
    const { existed, prevBootEpoch } = await c.backend.ops.heartbeat(c.nodeKey(id), c.setKey, id, fields, c.deadAfterMs);
    const first = c.st.beats === 0;
    c.st.beats += 1;
    // 첫 하트비트부터는 hash가 이름을 지킴 → 켜기 표시 풂 (켜자마자 죽은 뒤 다시 켤 때 표시가 hash보다 오래 남아 막지 않게)
    if (first) await c.backend.ops.delIfEquals(c.claimKey, c.bootEpoch).catch(() => {});
    if (!first && !existed) c.onLost();
    if (!first && existed && prevBootEpoch && prevBootEpoch !== c.bootEpoch && !c.st.conflictLogged) {
        c.st.conflictLogged = true;
        c.log.error(`[CLUSTER] 같은 SERVER_ID(${id})로 도는 다른 프로세스가 있음 — 설정 확인 필요`);
    }
    await refresh(c);
}

const duplicate = (c) => clusterError(CODES.DUPLICATE_SERVER_ID, `같은 SERVER_ID(${c.serverId})가 이미 돌고 있음`);

// 켜기 전 같은 이름 검사 (MN-118): 먼저 켜기 표시를 한 번에 잡음 → 같은 순간 켠 두 대 중 하나만 잡힘
// 표시를 잡았는데 남의 bootEpoch hash가 있으면 한 주기 넘게 기다려 lastSeen이 바뀌는지 봄
// 바뀌면 살아 있는 다른 프로세스 → 표시 풀고 켜기 거부, 안 바뀌면(죽은 옛 프로세스 흔적) 이어받음
async function claim(c) {
    if (!up(c)) throw clusterError(CODES.CLUSTER_UNAVAILABLE);
    const key = c.nodeKey(c.serverId);
    const before = await c.backend.ops.claimNode(c.claimKey, key, c.bootEpoch, c.claimHoldMs);
    if (!before.claimed) throw duplicate(c);
    if (!before.bootEpoch || before.bootEpoch === c.bootEpoch) return { checked: true };
    await new Promise((resolve) => setTimeout(resolve, c.heartbeatMs + 500));
    const after = await c.backend.ops.hgetall(key);
    if (after?.bootEpoch && after.bootEpoch !== c.bootEpoch && (after.lastSeen || null) !== before.lastSeen) {
        await c.backend.ops.delIfEquals(c.claimKey, c.bootEpoch).catch(() => {});
        throw duplicate(c);
    }
    return { checked: true };
}

// Node 목록 만들기, statsProvider: () => { games, rooms, online, loopP95 } (실패해도 하트비트는 감)
// connectWaitMs: 켜기 표시를 잡은 뒤 첫 하트비트까지 구독을 기다리는 최대 시간 (표시 수명 계산에 씀)
function createNodes({
    backend, prefix, serverId, bootEpoch, heartbeatMs, deadAfterMs, connectWaitMs = 0, version = "",
    statsProvider = () => ({}), onLost = () => {}, log = console, now = () => Date.now(),
}) {
    const c = {
        backend, serverId, bootEpoch, heartbeatMs, deadAfterMs, version, statsProvider, onLost, log, now,
        nodeKey: (id) => `${prefix}:node:${id}`, setKey: `${prefix}:nodes`, startedAt: now(),
        // 켜기 표시: 잡은 뒤 첫 하트비트까지(기다림 한 주기 + 구독 기다림) 넉넉히 + 죽음 판정 한 번 → 켜다 죽으면 그만큼 지나 풀림
        claimKey: `${prefix}:node:${serverId}:claim`, claimHoldMs: heartbeatMs + 500 + connectWaitMs + deadAfterMs,
        st: { draining: false, timer: null, beats: 0, conflictLogged: false, others: new Map() },
    };
    const safeBeat = () => beat(c).catch(() => { /* down이면 다음 차례에 */ });
    return {
        claim: () => claim(c),
        refresh: () => refresh(c),
        // 켜기(start) 전에는 안 씀 → 같은 이름 검사(claim) 전에 내 hash로 덮지 않게
        beatNow: () => (c.st.timer ? safeBeat() : Promise.resolve()),
        start() {
            safeBeat();
            c.st.timer = setInterval(safeBeat, heartbeatMs);
            c.st.timer.unref?.();
        },
        // 끄기: 하트비트 멈추고 내 hash 지움 (다른 Node가 바로 죽음으로 봄)
        // 하트비트를 안 켠 Node(같은 이름 검사에 걸림·준비 전)는 hash가 남의 것 → 내 켜기 표시만 풂
        async stop() {
            const started = c.st.timer !== null;
            clearInterval(c.st.timer);
            c.st.timer = null;
            if (!up(c)) return;
            await backend.ops.delIfEquals(c.claimKey, bootEpoch).catch(() => {});
            if (!started) return;
            await backend.ops.del(c.nodeKey(serverId)).catch(() => {});
            await backend.ops.srem(c.setKey, serverId).catch(() => {});
        },
        // 살아 있는 Node 목록 (나 포함, 나는 늘 첫째), Redis down·단일 모드면 나만
        list() {
            const mine = { ...selfInfo(c), alive: true, self: true };
            if (!up(c)) return [mine];
            return [mine, ...[...c.st.others.values()].map((info) => ({ ...info, alive: true, self: false }))];
        },
        ids: () => (up(c) ? [serverId, ...c.st.others.keys()] : [serverId]),
        // 살아 있나: bootEpoch를 주면 그 부팅까지 같아야 true (같은 이름 재시작 뒤 옛 값 안 믿기)
        isAlive(id, epoch) {
            if (id === serverId) return epoch == null || epoch === bootEpoch;
            const info = up(c) ? c.st.others.get(id) : null;
            return Boolean(info) && (epoch == null || info.bootEpoch === epoch);
        },
        setDraining(value) {
            c.st.draining = Boolean(value);
            if (c.st.timer) safeBeat();
            return c.st.draining;
        },
        isDraining: () => c.st.draining,
    };
}

module.exports = { createNodes, parseInfo };
