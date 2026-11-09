// 노드 넘는 옛 탭 밀어내기 파일, 접속마다 순번(connseq)을 받아 conn:<uuid>에 적고 버스 conn.replaced로 다른 Node에 알림
// socket/connection/presence.js가 접속·끊김 때 부름, 받은 Node는 순번이 작은 내 소켓만 끊음 (4-3장, MN-063~066·072)
const cluster = require("../../cluster");
const emitter = require("../emitter");

// 밀려난 까닭 글 (같은 로그인 세션 = 같은 브라우저 다른 탭, known 1-15)
function describeReplacementBySession(oldSessionId, newSessionId) {
    const sameSession = typeof newSessionId === "string" && oldSessionId === newSessionId;
    return sameSession
        ? {
            message: "같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.",
            code: "REPLACED_BY_SAME_SESSION",
        }
        : {
            message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            code: "REPLACED_BY_OTHER_LOGIN",
        };
}

// 이 Node가 conn:<uuid>에 적은 값 (uuid → { socketId, value }), 끊길 때 내 값일 때만 지우기용
const connValues = new Map();
// 최근 받은 다른 Node 순번 (uuid → { seq, sessionId, at }), 내 순번 받기 전에 온 알림 기억
const remoteSeen = new Map();
const REMOTE_SEEN_MS = 10 * 1000;
let started = false;

// 받은 알림 모양 확인
const isReplacedMessage = (msg) => typeof msg?.uuid === "string" && msg.uuid.length > 0
    && Number.isInteger(msg.seq) && msg.seq > 0 && typeof msg.node === "string";

// 오래된 기억 지우기 (넣을 때마다, 계정마다 쌓이지 않게)
function rememberRemote(uuid, seq, sessionId, now = Date.now()) {
    for (const [key, seen] of remoteSeen) if (now - seen.at > REMOTE_SEEN_MS) remoteSeen.delete(key);
    const prev = remoteSeen.get(uuid);
    if (!prev || prev.seq < seq) remoteSeen.set(uuid, { seq, sessionId, at: now });
}

// 내 소켓 밀어내기: 접속 목록에서 먼저 빼고 표시 남긴 뒤 끊음
// forcedLogout 표시 → presence 끊김 처리가 OFFLINE을 안 씀 (사람은 다른 Node에 접속 중, MN-066)
function kickLocal(socket, uuid, newSessionId) {
    if (emitter.onlineUsers.get(uuid) === socket.id) emitter.onlineUsers.delete(uuid);
    forgetConnection(socket, uuid).catch(() => false);
    socket.data.forcedLogout = true;
    socket.emit("force_disconnect", describeReplacementBySession(socket.data?.user?.sessionId, newSessionId));
    socket.disconnect(true);
}

// 다른 Node에서 새로 붙었다는 알림 받음 → 내 소켓 순번이 더 작으면 끊음
// 내 순번을 아직 받는 중이면 기억만 (announceConnection이 받은 뒤 비교), 순번 없는 소켓(Redis 죽은 동안 붙음)은 옛것으로 봄
function onConnReplaced(msg) {
    if (!isReplacedMessage(msg) || msg.node === cluster.serverId()) return;
    rememberRemote(msg.uuid, msg.seq, msg.sessionId);
    const socketId = emitter.onlineUsers.get(msg.uuid);
    const socket = socketId ? emitter.getIo()?.sockets?.sockets?.get(socketId) : null;
    if (!socket || socket.data.connSeqPending) return;
    const mine = socket.data.connSeq;
    if (Number.isInteger(mine) && mine >= msg.seq) {
        // 내가 새것: 옛 Node가 conn을 늦게 덮었을 수 있어 내 값 다시 적음 (그 Node는 적은 뒤에 알림을 보냄)
        const entry = connValues.get(msg.uuid);
        if (entry?.socketId === socket.id) {
            cluster.directory.write(cluster.directory.keys().conn(msg.uuid), entry.value, { ttlMs: cluster.TTL.conn }).catch(() => false);
        }
        return;
    }
    kickLocal(socket, msg.uuid, msg.sessionId);
}

// 접속 알리기: 순번 받기 → conn 적기 → 다른 Node에 알림 (Redis 못 쓰면 아무것도 안 함, 같은 Node 밀어내기는 presence가 따로)
// 두 Node에 거의 동시에 붙어도 순번 큰 쪽 하나만 남음 (MN-065)
async function announceConnection(socket, uuid) {
    if (!cluster.isShared()) return;
    const keys = cluster.directory.keys();
    socket.data.connSeqPending = true;
    let seq;
    try {
        seq = await cluster.directory.nextSeq(keys.connseq(uuid), cluster.TTL.conn);
    } finally {
        socket.data.connSeqPending = false;
    }
    if (seq == null || socket.connected === false || emitter.onlineUsers.get(uuid) !== socket.id) return;
    socket.data.connSeq = seq;
    // 순번 받는 사이 더 큰 순번 알림이 왔으면 내가 옛것
    const seen = remoteSeen.get(uuid);
    if (seen && seen.seq > seq) {
        kickLocal(socket, uuid, seen.sessionId);
        return;
    }
    const sessionId = socket.data?.user?.sessionId ?? null;
    const value = { node: cluster.serverId(), bootEpoch: cluster.bootEpoch(), socketId: socket.id, seq, sessionId };
    connValues.set(uuid, { socketId: socket.id, value });
    await cluster.directory.write(keys.conn(uuid), value, { ttlMs: cluster.TTL.conn });
    await cluster.bus.publish(cluster.BUS_TYPES.CONN_REPLACED, { uuid, node: value.node, socketId: socket.id, seq, sessionId });
}

// 끊김: 내가 적은 값 그대로일 때만 conn 지움 (CAS, 같은 Node 새 소켓·다른 Node 값은 안 지움, MN-072)
async function forgetConnection(socket, uuid) {
    const entry = connValues.get(uuid);
    if (!entry || entry.socketId !== socket.id) return false;
    connValues.delete(uuid);
    if (!cluster.isShared()) return false;
    return cluster.directory.removeIfValue(cluster.directory.keys().conn(uuid), entry.value);
}

// 다른 Node에서 접속 중인지 (conn 주인이 살아 있는 다른 Node) → 친구 OFFLINE 알림 미루기 판단용
// Redis를 못 쓰면 false (모름 = 내 Node 기준으로 판단, 지금과 같음)
async function isConnectedElsewhere(uuid) {
    if (!cluster.isShared()) return false;
    const found = await cluster.directory.locate(cluster.directory.keys().conn(uuid));
    return Boolean(found.available && found.node && !found.self && found.alive);
}

// Redis 살아남 → 내 소켓 conn 다시 적기 (없을 때만, 그사이 다른 Node가 적었으면 그대로)
// 죽은 동안 붙어 순번 없는 소켓은 이제 순번 받고 알림 (계정당 소켓 하나로 맞춤)
async function resyncConnections() {
    if (!cluster.isShared()) return;
    const sockets = emitter.getIo()?.sockets?.sockets;
    const keys = cluster.directory.keys();
    const jobs = [];
    for (const [uuid, socketId] of emitter.onlineUsers) {
        const entry = connValues.get(uuid);
        if (entry?.socketId === socketId) {
            jobs.push(cluster.directory.write(keys.conn(uuid), entry.value, { ttlMs: cluster.TTL.conn, nx: true }));
            continue;
        }
        const socket = sockets?.get(socketId);
        if (socket) jobs.push(announceConnection(socket, uuid));
    }
    await Promise.all(jobs.map((job) => Promise.resolve(job).catch(() => false)));
}

// 버스·다시 맞추기 처리기 붙이기 (여러 번 불러도 한 번만)
function startReplaceSync() {
    if (started) return;
    started = true;
    cluster.bus.on(cluster.BUS_TYPES.CONN_REPLACED, onConnReplaced);
    cluster.onResync(resyncConnections);
}

// 시험용: 기억 비우기
function __resetReplaceForTests() {
    connValues.clear();
    remoteSeen.clear();
}

module.exports = {
    describeReplacementBySession,
    announceConnection,
    forgetConnection,
    isConnectedElsewhere,
    onConnReplaced,
    resyncConnections,
    startReplaceSync,
    __resetReplaceForTests,
};
