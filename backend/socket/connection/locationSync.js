// 위치 맞추기 파일, 지켜보는 장부(playerRoom·playerSession·gameSessions)가 바뀌면 Redis loc:<uuid>·game:<id>를 고침
// socket.js initSocket이 startLocationSync 한 번 부름, 길잡이(nodeRouting)·조각 2·4가 이 키를 읽음
const cluster = require("../../cluster");
const { playerRoom } = require("../matchmaking/core/state");
const { gameSessions, playerSession } = require("../../game-core/core/registry/state");

// 고칠 차례를 기다리는 키 (같은 차례에 여러 번 바뀌어도 한 번만 씀, 판 시작 때 5~10명 한꺼번에)
const dirty = { loc: new Set(), game: new Set() };
// 이 Node가 Redis에 써 둔 키 (빼기는 써 둔 것만, 다시 맞출 때 남은 것 정리)
const owned = { loc: new Set(), game: new Set() };
let flushQueued = false;
let started = false;
const offs = [];

// 지금 이 사람이 있는 곳: 판이 먼저, 없으면 대기방, 둘 다 없으면 null
// 판 끝 → 다음 방처럼 둘 다 있어도 같은 Node라 어느 쪽이든 길잡이 결과는 같음
function placeOf(uuid) {
    const gameId = playerSession.get(uuid);
    if (gameId) return { kind: "game", id: gameId };
    const roomId = playerRoom.get(uuid);
    if (roomId) return { kind: "room", id: roomId };
    return null;
}

// loc:<uuid> 값 (4-2장 약속 {node, bootEpoch, kind, id})
const locValue = (place) => ({ node: cluster.serverId(), bootEpoch: cluster.bootEpoch(), kind: place.kind, id: place.id });

// 사람 하나 위치 쓰기·빼기 → Promise (못 써도 던지지 않음)
function syncLoc(uuid) {
    const key = cluster.directory.keys().loc(uuid);
    const place = placeOf(uuid);
    if (place) {
        owned.loc.add(uuid);
        return cluster.directory.write(key, locValue(place), { ttlMs: cluster.TTL.loc });
    }
    if (!owned.loc.delete(uuid)) return Promise.resolve(false);
    // 내 것일 때만 지움 → 다른 Node로 옮긴 뒤 늦게 온 지우기가 새 값을 안 지움 (MN-074)
    return cluster.directory.removeIfOwned(key);
}

// 판 하나 주인 쓰기·빼기 (game:<id> 값은 Node 이름 글자, 4-2장)
function syncGame(gameId) {
    const key = cluster.directory.keys().game(gameId);
    if (gameSessions.has(gameId)) {
        owned.game.add(gameId);
        return cluster.directory.write(key, cluster.serverId(), { ttlMs: cluster.TTL.game });
    }
    if (!owned.game.delete(gameId)) return Promise.resolve(false);
    return cluster.directory.removeIfOwned(key);
}

// 모아 둔 키 한 번에 고치기
// Redis 못 쓰는 동안(down)은 버림 → 살아나면 resyncAll이 지금 장부 그대로 다시 씀
function flush() {
    flushQueued = false;
    const locs = [...dirty.loc];
    const games = [...dirty.game];
    dirty.loc.clear();
    dirty.game.clear();
    if (!cluster.isShared()) return Promise.resolve();
    const writes = [...locs.map(syncLoc), ...games.map(syncGame)];
    return Promise.all(writes.map((p) => Promise.resolve(p).catch(() => false))).then(() => undefined);
}

// 바뀐 키 표시, 단일 모드(REDIS_URL 없음)면 아무것도 안 함 (지금과 같음)
function mark(kind, key) {
    if (!cluster.isEnabled()) return;
    dirty[kind].add(key);
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
}

// 지켜보는 Map 알림 → 고칠 키 표시 (비우기면 비우기 전 키 전부)
const listenerFor = (kind) => (change) => {
    if (change.type === "clear") change.entries.forEach(([key]) => mark(kind, key));
    else mark(kind, change.key);
};

// Redis가 살아남·비었음 → 지금 장부 그대로 다시 쓰고, 써 뒀는데 지금 없는 것은 지움 (MN-099·103)
async function resyncAll() {
    if (!cluster.isShared()) return;
    const uuids = new Set([...owned.loc, ...playerRoom.keys(), ...playerSession.keys()]);
    const gameIds = new Set([...owned.game, ...gameSessions.keys()]);
    await Promise.all([
        ...[...uuids].map((uuid) => syncLoc(uuid).catch(() => false)),
        ...[...gameIds].map((gameId) => syncGame(gameId).catch(() => false)),
    ]);
}

// 켜기 (여러 번 불러도 한 번만, 시험이 initSocket을 여러 번 부름)
function startLocationSync() {
    if (started) return;
    started = true;
    offs.push(
        playerRoom.onChange(listenerFor("loc")),
        playerSession.onChange(listenerFor("loc")),
        gameSessions.onChange(listenerFor("game")),
        cluster.onResync(resyncAll),
    );
}

// 시험용: 떼고 기록 비우기
function __stopLocationSyncForTests() {
    for (const off of offs.splice(0)) off();
    started = false;
    flushQueued = false;
    for (const set of [dirty.loc, dirty.game, owned.loc, owned.game]) set.clear();
}

module.exports = {
    startLocationSync,
    resyncAll,
    placeOf,
    // 시험이 쓰기 끝을 기다릴 때 (모아 둔 것 바로 고침)
    flushNow: flush,
    __stopLocationSyncForTests,
};
