// 공개 방 목록 합치기 파일, Node마다 자기 방 스냅샷을 버스 rooms.snapshot·Redis rooms:node:<id>로 나누고 받은 것과 합침
// room/view.js가 목록 보낼 때 부름 (0.5초 묶음은 view.js 그대로), 단일 모드면 아무것도 안 함 (내 방만, 지금과 같음)
const cluster = require('../../../cluster')
const { scheduleRoomDirectorySync, reconcileRoomDirectory } = require('./roomDirectory')

// 시간 값 (시험이 줄임): 정리 주기 · 스냅샷 다시 보내는 주기 수 · 죽은 Node 스냅샷 버리기 전 여유
const timing = { tickMs: 1000, publishEvery: 5, deadGraceMs: 4000 }
const MAX_ROOMS = 2000

// 다른 Node 스냅샷 (Node 이름 → { node, bootEpoch, rooms, at, receivedAt })
const remote = new Map()
const run = { localDirty: true, io: null, timer: null, ticks: 0, hooks: null }

const isRoutableName = (node) => typeof node === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(node)

// 받은 스냅샷 모양 확인 → 다듬은 것 또는 null (틀린 모양·내 것은 버림)
function readSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || !isRoutableName(raw.node) || raw.node === cluster.serverId()) return null
    if (!Array.isArray(raw.rooms) || raw.rooms.length > MAX_ROOMS || !Number.isFinite(raw.at)) return null
    const rooms = raw.rooms.filter((room) => room && typeof room === 'object' && typeof room.id === 'string')
    return { node: raw.node, bootEpoch: typeof raw.bootEpoch === 'string' ? raw.bootEpoch : null, rooms, at: raw.at }
}

// 스냅샷 넣기: 같은 Node 것보다 옛것이면 버림 → 방 목록이 바뀌었으면 true
// 5초마다 오는 같은 내용은 받은 시각만 고침 (내 Node 사람에게 같은 목록을 또 보내지 않게)
function acceptSnapshot(raw) {
    const snapshot = readSnapshot(raw)
    if (!snapshot) return false
    const prev = remote.get(snapshot.node)
    if (prev && prev.at > snapshot.at) return false
    const roomsJson = JSON.stringify(snapshot.rooms)
    remote.set(snapshot.node, { ...snapshot, roomsJson, receivedAt: Date.now() })
    return !prev || prev.roomsJson !== roomsJson || prev.bootEpoch !== snapshot.bootEpoch
}

// 합치기 (MN-088): 내 방 먼저, 같은 방 id가 여러 스냅샷에 있으면 가장 최근 스냅샷 것, 순서는 Node 이름 → 방 순서 (목록이 왔다 갔다 안 하게)
function mergeRoomLists(localRooms, snapshots) {
    const seen = new Set(localRooms.map((room) => room.id))
    const owner = new Map()
    for (const snap of [...snapshots].sort((a, b) => b.at - a.at)) {
        for (const room of snap.rooms) {
            if (seen.has(room.id) || owner.has(room.id)) continue
            owner.set(room.id, snap.node)
        }
    }
    const merged = [...localRooms]
    for (const snap of [...snapshots].sort((a, b) => a.node.localeCompare(b.node))) {
        for (const room of snap.rooms) {
            if (owner.get(room.id) === snap.node) merged.push({ ...room, node: snap.node })
        }
    }
    return merged
}

// 지금 보낼 목록: Redis를 나눠 쓸 수 있으면 합침, 아니면 내 방만 (4-6장)
const mergedRooms = (localRooms) => (cluster.isShared() ? mergeRoomLists(localRooms, [...remote.values()]) : localRooms)

// 내 스냅샷 보내기 (내 방이 바뀌었거나 force), 버스 + 새로 켠 Node가 읽을 키 (MN-084)
function publishLocalSnapshot(localRooms, { force = false } = {}) {
    if (!cluster.isShared() || !(run.localDirty || force)) return
    run.localDirty = false
    const snapshot = { node: cluster.serverId(), bootEpoch: cluster.bootEpoch(), rooms: localRooms, at: Date.now() }
    cluster.bus.publish(cluster.BUS_TYPES.ROOMS_SNAPSHOT, snapshot).catch(() => false)
    cluster.directory.write(cluster.directory.keys().roomsNode(snapshot.node), snapshot, { ttlMs: cluster.TTL.roomsNode }).catch(() => false)
}

// 내 방이 바뀜 (view.js가 목록 방송 예약할 때): 다음 보낼 때 스냅샷도 보냄 + 방 디렉터리 맞추기
function markLocalRoomsChanged() {
    if (!cluster.isEnabled()) return
    run.localDirty = true
    scheduleRoomDirectorySync()
}

// 다시 보내기 (내 방은 안 바뀜, 받은 스냅샷·정리 때문에)
const rebroadcast = () => { if (run.io && run.hooks) run.hooks.rebroadcast(run.io) }

// 죽은·오래된 스냅샷 버리기 (MN-083) → 버린 게 있으면 true
function pruneSnapshots(now = Date.now()) {
    let changed = false
    for (const [node, snap] of remote) {
        const age = now - snap.receivedAt
        const dead = age > timing.deadGraceMs && !cluster.nodes.isAlive(node, snap.bootEpoch)
        if (age > cluster.TTL.roomsNode || dead) {
            remote.delete(node)
            changed = true
        }
    }
    return changed
}

// 살아 있는데 스냅샷이 없는 Node는 키에서 읽어 옴 (새로 켠 Node·놓친 방송, MN-084)
async function loadMissingSnapshots() {
    if (!cluster.isShared()) return false
    let changed = false
    const targets = cluster.nodes.list().filter((n) => !n.self && n.alive && !remote.has(n.id))
    for (const target of targets) {
        const { value } = await cluster.directory.read(cluster.directory.keys().roomsNode(target.id))
        if (acceptSnapshot(value)) changed = true
    }
    return changed
}

// 주기 일: 정리 매번, 스냅샷 다시 보내기·빠진 것 읽기·디렉터리 맞추기는 publishEvery번에 한 번
async function tick() {
    let changed = pruneSnapshots()
    run.ticks += 1
    if (run.ticks % timing.publishEvery === 0 && cluster.isShared() && run.hooks) {
        publishLocalSnapshot(run.hooks.buildLocal(), { force: true })
        changed = (await loadMissingSnapshots()) || changed
        await reconcileRoomDirectory()
    }
    if (changed) rebroadcast()
}

// io 묶기 (matchmaking.js가 접속마다 부름): 받은 스냅샷을 이 io의 내 Node 사람에게 보내고 주기 일 시작
function bindRoomListIo(io) {
    if (!cluster.isEnabled() || !io) return
    run.io = io
    if (run.timer) return
    run.timer = setInterval(() => { tick().catch(() => {}) }, timing.tickMs)
    run.timer.unref?.()
    loadMissingSnapshots().then((changed) => { if (changed) rebroadcast() }, () => {})
}

// view.js가 넣음: 내 방 목록 만들기·목록 다시 보내기 (불러오기 순환 막기)
function setRoomListHooks(hooks) { run.hooks = hooks }

// 다른 Node 스냅샷 받음 → 넣고 내 Node 사람에게 다시 보냄 (0.5초 묶음은 view.js)
cluster.bus.on(cluster.BUS_TYPES.ROOMS_SNAPSHOT, (msg) => { if (acceptSnapshot(msg)) rebroadcast() })
// Redis 죽음 → 내 방만 보냄 / 살아남·비었음 → 내 스냅샷 다시 보내고 빠진 것 읽음 (MN-101)
cluster.onStateChange((next) => { if (next === 'down') rebroadcast() })
cluster.onResync(async () => {
    run.localDirty = true
    await loadMissingSnapshots()
    rebroadcast()
})

// 시험용: 받은 스냅샷·묶은 io·주기 일 비우기 / 시간 줄이기 / 지금 주기 일 한 번
function __resetRoomListSyncForTests() {
    remote.clear()
    clearInterval(run.timer)
    Object.assign(run, { localDirty: true, io: null, timer: null, ticks: 0 })
}
const __setRoomListTimingForTests = (next) => Object.assign(timing, next)

module.exports = {
    mergeRoomLists,
    mergedRooms,
    publishLocalSnapshot,
    markLocalRoomsChanged,
    bindRoomListIo,
    setRoomListHooks,
    pruneSnapshots,
    __resetRoomListSyncForTests,
    __setRoomListTimingForTests,
    __tickRoomListForTests: tick,
    __remoteSnapshotsForTests: () => remote,
}
