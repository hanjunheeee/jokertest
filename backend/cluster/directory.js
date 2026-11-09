// 위치 디렉터리 파일, 방·판·사람 → 주인 Node 짝을 Redis에 읽고 쓰기 (키 모양 4-2장)
// cluster/index.js가 만들어 directory로 내보냄, 쓰는 곳은 조각 3·4 (이 조각은 API만)

// 수명 기본값 (4-2장)
const TTL = Object.freeze({
    loc: 24 * 60 * 60 * 1000,
    conn: 24 * 60 * 60 * 1000,
    room: 6 * 60 * 60 * 1000,
    roomcode: 6 * 60 * 60 * 1000,
    startedcode: 30 * 60 * 1000,
    game: 6 * 60 * 60 * 1000,
    roomsNode: 15 * 1000,
});
// 이 Node가 쓴 키 목록 수명 (가장 긴 키 수명과 같게)
const TRACK_TTL_MS = 24 * 60 * 60 * 1000;

// 키 이름 만들기 (prefix 붙임) — 조각 3·4는 이것만 써서 키 모양을 맞춤
const createKeys = (prefix) => Object.freeze({
    loc: (uuid) => `${prefix}:loc:${uuid}`,
    conn: (uuid) => `${prefix}:conn:${uuid}`,
    connseq: (uuid) => `${prefix}:connseq:${uuid}`,
    room: (roomId) => `${prefix}:room:${roomId}`,
    roomcode: (code) => `${prefix}:roomcode:${code}`,
    startedcode: (code) => `${prefix}:startedcode:${code}`,
    game: (gameId) => `${prefix}:game:${gameId}`,
    roomsNode: (nodeId) => `${prefix}:rooms:node:${nodeId}`,
    lock: (name) => `${prefix}:lock:${name}`,
});

// 값 바꾸기: 객체는 JSON, 글자는 그대로 / 읽을 때 JSON처럼 보이면 풀어 봄
const encode = (value) => (typeof value === "string" ? value : JSON.stringify(value));
const decode = (text) => {
    if (typeof text !== "string") return null;
    if (!text.startsWith("{") && !text.startsWith("[")) return text;
    try { return JSON.parse(text); } catch { return text; }
};
// 값에서 주인 Node 꺼내기: 객체면 .node, 글자면 그 글자 (game:<id> = node)
const ownerOf = (value) => (value && typeof value === "object" ? value.node ?? null : typeof value === "string" ? value : null);

// Redis를 쓸 수 있으면 fn(ops), 못 쓰거나 실패하면 fallback (던지지 않음)
const attempt = async (backend, fallback, fn) => {
    if (!backend || backend.state() !== "up") return fallback;
    try { return await fn(backend.ops); } catch { return fallback; }
};

// 읽고 주인 살아 있는지까지 → { available, value, node, alive, self }
// alive: 주인 Node 하트비트가 있고, 값에 bootEpoch가 있으면 그 부팅까지 같음
async function locateIn({ read, nodes, serverId }, key) {
    const { available, value } = await read(key);
    const node = ownerOf(value);
    if (!available || !node) return { available, value, node, alive: false, self: false };
    const epoch = value && typeof value === "object" ? value.bootEpoch ?? null : null;
    return { available: true, value, node, alive: nodes.isAlive(node, epoch), self: node === serverId };
}

// 디렉터리 만들기
// - 읽기는 던지지 않음: { available:false }면 Redis를 못 씀(단일 모드·down) → 부른 쪽이 대체 동작
// - 쓰기·지우기는 성공 true / 못 함 false
function createDirectory({ backend, prefix, serverId, bootEpoch, nodes }) {
    const trackKey = `${prefix}:node:${serverId}:keys`;
    const available = () => Boolean(backend) && backend.state() === "up";
    const unavailable = { available: false, value: null };
    const read = (key) => attempt(backend, unavailable, async (ops) => ({ available: true, value: decode(await ops.get(key)) }));

    return {
        keys: createKeys(prefix),
        TTL,
        available,
        read,
        locate: (key) => locateIn({ read, nodes, serverId }, key),
        // 쓰기: ttlMs 수명, nx면 없을 때만 (방 코드 미리 잡기), 이 Node가 쓴 키 목록에도 남김 (켤 때 정리용)
        write: (key, value, { ttlMs, nx = false } = {}) => (!Number.isInteger(ttlMs) || ttlMs <= 0
            ? Promise.resolve(false)
            : attempt(backend, false, (ops) => ops.writeTracked(key, encode(value), { pxMs: ttlMs, nx, trackKey, trackPxMs: TRACK_TTL_MS }))),
        // 내 것일 때만 지움 (값의 node가 나 + bootEpoch가 있으면 내 부팅) → 옮긴 뒤 옛 Node가 새 값을 안 지움 (CAS)
        removeIfOwned: (key) => attempt(backend, false, (ops) => ops.delIfOwner(key, serverId, bootEpoch, trackKey)),
        // 값이 똑같을 때만 지움 (roomcode처럼 값이 node가 아닌 키)
        removeIfValue: (key, expected) => attempt(backend, false, (ops) => ops.delIfEquals(key, encode(expected), trackKey)),
        // 순번 늘리기 (connseq) → 숫자, 못 쓰면 null
        nextSeq: (key, ttlMs = TTL.conn) => attempt(backend, null, (ops) => ops.incrWithTtl(key, ttlMs)),
        // 켤 때 정리: 옛 부팅이 쓴 키 중 아직 그 값 그대로인 것만 지움 → 지운 수, 못 하면 null
        cleanupStale: () => attempt(backend, null, (ops) => ops.cleanupTracked(trackKey)),
    };
}

module.exports = { TTL, createKeys, createDirectory, encode, decode, ownerOf };
