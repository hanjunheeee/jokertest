// 방 디렉터리 파일, 이 Node 대기방을 Redis room:<id>·roomcode:<CODE>에 맞춰 두고 방 코드 미리 잡기·시작 표시(startedcode) 쓰기·지우기
// + 판 동안 옛 방 키 잡아 두기 → 판 끝에 같은 코드 새 방으로 넘기기 (다른 Node가 그 코드를 못 뽑고, 코드 입장은 판 Node로 감)
// join/create(코드 잡기)·join/startedMarks(시작 표시)·room/view(목록 바뀔 때 맞추기)·roomListSync(5초 주기)·room/startLaunch·room/returnRoom(잡기·넘기기·놓기)이 부름, 단일 모드면 아무것도 안 함
const cluster = require('../../../cluster')
const { gameRooms } = require('../core/state')
const { generateUniqueRoomCode } = require('../../../utils/roomCode')

// 다시 써서 수명 늘리는 간격 (방 키 수명 6시간의 절반)
const REFRESH_MS = 3 * 60 * 60 * 1000

// 이 Node가 써 둔 방 (방 id → { code, instanceId, writtenAt }), 맞추기 때 지금 장부와 비교함
const owned = new Map()
let queued = false

// 판 동안 잡아 둔 옛 방 (옛 방 id → { id, code, instanceId }), 맞추기 때 있는 방처럼 써 두고 수명도 늘림
const heldRooms = new Map()

// 같은 코드 새 방으로 넘기는 중 (코드 → 옛 방 id), 새 방이 옛 방 값이 든 코드 키를 덮어쓸 수 있게
const codeHandoffs = new Map()

const keys = () => cluster.directory.keys()

// room:<id> 값 (4-2장 {node, bootEpoch, code, instanceId})
const roomValue = (room) => ({
    node: cluster.serverId(),
    bootEpoch: cluster.bootEpoch(),
    code: room.code ?? null,
    instanceId: room.instanceId ?? room.id,
})

// 코드 잡기 → 'claimed'(내 방 것) | 'taken'(다른 방이 잡음) | 'unavailable'(Redis 못 씀)
async function claimCode(code, roomId) {
    const key = keys().roomcode(code)
    const ttlMs = cluster.TTL.roomcode
    if (await cluster.directory.write(key, roomId, { ttlMs, nx: true })) return 'claimed'
    const current = await cluster.directory.read(key)
    if (!current.available) return 'unavailable'
    // 이미 내 방 것이면 수명만 늘림
    if (current.value === roomId) return (await cluster.directory.write(key, roomId, { ttlMs })) ? 'claimed' : 'unavailable'
    // 그사이 지워졌으면 한 번만 다시
    if (current.value === null) return (await cluster.directory.write(key, roomId, { ttlMs, nx: true })) ? 'claimed' : 'taken'
    // 판 끝에 같은 코드로 다시 연 방: 판 동안 잡아 둔 옛 방 값이면 새 방 값으로 덮어씀
    if (codeHandoffs.get(code) === current.value) return (await cluster.directory.write(key, roomId, { ttlMs })) ? 'claimed' : 'unavailable'
    return 'taken'
}

// 방 하나 쓰기: room 키 + 코드 키 (코드가 다른 방 것이면 로그만, Redis 죽은 동안 겹친 것)
async function writeRoom(room) {
    if (!(await cluster.directory.write(keys().room(room.id), roomValue(room), { ttlMs: cluster.TTL.room }))) return false
    if (!room.code) return true
    const claimed = await claimCode(room.code, room.id)
    if (claimed === 'claimed' && codeHandoffs.get(room.code) !== room.id) codeHandoffs.delete(room.code)
    if (claimed === 'taken') console.warn('[방 디렉터리] 방 코드가 다른 Node 방과 겹침 — 이 방은 코드 입장이 내 Node 안에서만 됨', { roomId: room.id })
    return claimed !== 'unavailable'
}

// 방 하나 빼기: 내 것일 때만 (옮긴 뒤 다른 Node 값은 안 지움)
async function removeRoom(roomId, code) {
    await cluster.directory.removeIfOwned(keys().room(roomId))
    if (code) await cluster.directory.removeIfValue(keys().roomcode(code), roomId)
}

// 써야 할 방 (없음·코드·인스턴스 바뀜·오래됨)
function needsWrite(room, now) {
    const prev = owned.get(room.id)
    if (!prev) return true
    return prev.code !== (room.code ?? null) || prev.instanceId !== (room.instanceId ?? room.id) || now - prev.writtenAt >= REFRESH_MS
}

// 지금 대기방 장부(+ 판 동안 잡아 둔 옛 방)와 디렉터리 맞추기: 새 방·바뀐 방은 쓰고, 없어진 방은 지움
// Redis 못 쓰는 동안(down)은 그냥 둠 → 살아나면 resync가 다시 맞춤
async function reconcile() {
    queued = false
    if (!cluster.isShared()) return
    const now = Date.now()
    const jobs = []
    // 넘길 새 방이 없어진 코드는 넘기기 기록도 지움 (새 방이 그새 사라짐)
    const liveCodes = new Set([...gameRooms.values()].map((room) => room.code))
    for (const code of [...codeHandoffs.keys()]) if (!liveCodes.has(code)) codeHandoffs.delete(code)
    for (const room of [...gameRooms.values(), ...heldRooms.values()]) {
        if (!needsWrite(room, now)) continue
        const prev = owned.get(room.id)
        const entry = { code: room.code ?? null, instanceId: room.instanceId ?? room.id, writtenAt: now }
        owned.set(room.id, entry)
        if (prev?.code && prev.code !== entry.code) jobs.push(cluster.directory.removeIfValue(keys().roomcode(prev.code), room.id))
        // 못 썼으면 다음 맞추기 때 다시
        jobs.push(writeRoom(room).then((ok) => { if (!ok && owned.get(room.id) === entry) entry.writtenAt = -Infinity }))
    }
    for (const [roomId, entry] of [...owned]) {
        if (gameRooms.has(roomId) || heldRooms.has(roomId)) continue
        owned.delete(roomId)
        jobs.push(removeRoom(roomId, entry.code))
    }
    await Promise.all(jobs.map((job) => Promise.resolve(job).catch(() => false)))
}

// 맞추기 예약: 같은 차례에 여러 번 불러도 한 번만, 단일 모드면 아무것도 안 함
function scheduleRoomDirectorySync() {
    if (!cluster.isEnabled() || queued) return
    queued = true
    queueMicrotask(() => { reconcile().catch(() => {}) })
}

// 방 만들 때 코드 잡기 (Node 여러 개일 때만 부름)
// 내 Node에서 안 겹치는 코드 → 다른 Node 판이 쓰는 코드(startedcode)는 피함 → Redis NX로 잡음
// → { code, claimed } (claimed false = Redis 못 써서 내 Node 검사만, 4-6장), retry번 안에 못 찾으면 null
async function reserveRoomCode(roomId, { isReserved, generator, retry = 5 } = {}) {
    for (let attempt = 0; attempt < retry; attempt += 1) {
        const code = generateUniqueRoomCode(gameRooms, { retry: 1, generator, isReserved })
        if (!code) continue
        if (!cluster.isShared()) return { code, claimed: false }
        if ((await cluster.directory.read(keys().startedcode(code))).value) continue
        const claimed = await claimCode(code, roomId)
        if (claimed === 'claimed') return { code, claimed: true }
        if (claimed === 'unavailable') return { code, claimed: false }
    }
    return null
}

// 잡은 코드 놓기 (방 만들기가 중간에 그만뒀을 때), 값이 그 방일 때만
function releaseRoomCode(code, roomId) {
    if (!code || !cluster.isEnabled()) return
    cluster.directory.removeIfValue(keys().roomcode(code), roomId).catch(() => {})
}

// 시작 표시 값 (쓰기·지우기가 같은 모양이어야 값 비교 지우기가 맞음)
const startedValue = (gameId) => ({ gameId: typeof gameId === 'string' ? gameId : null, node: cluster.serverId() })

// 시작된 방 코드 표시: 다른 Node에서도 "이미 시작"으로 답하게 (30분, 4-2장 {gameId, node})
function markRoomStarted(room, gameId) {
    if (!cluster.isEnabled() || typeof room?.code !== 'string' || !room.code) return
    cluster.directory.write(keys().startedcode(room.code), startedValue(gameId), { ttlMs: cluster.TTL.startedcode }).catch(() => {})
}

// 시작 표시 지우기: 판 끝에 같은 코드 방이 다시 열림 (그 판이 쓴 값일 때만)
function clearRoomStarted(code, gameId) {
    if (!cluster.isEnabled() || typeof code !== 'string' || !code) return
    cluster.directory.removeIfValue(keys().startedcode(code), startedValue(gameId)).catch(() => {})
}

// 판 시작: 지워질 방의 room·roomcode 키를 판 동안 잡아 둠 (판 끝까지, 수명은 맞추기가 늘림)
// 안 잡으면 다른 Node가 같은 코드를 뽑거나, 코드만 남은 흔적으로 보고 지움
function holdRoomCodeForGame(room) {
    if (!cluster.isEnabled() || typeof room?.code !== 'string' || !room.code) return
    heldRooms.set(room.id, { id: room.id, code: room.code, instanceId: room.instanceId ?? room.id })
    scheduleRoomDirectorySync()
}

// 판 끝: 잡아 둔 옛 방 키를 같은 코드 새 방으로 넘김 (옛 방 키는 다음 맞추기가 지우고, 코드 키는 새 방 값으로 덮어씀)
function handOffHeldRoomCode(oldRoomId, newRoom) {
    if (!cluster.isEnabled()) return
    const held = heldRooms.get(oldRoomId)
    heldRooms.delete(oldRoomId)
    if (held?.code && held.code === newRoom?.code) codeHandoffs.set(held.code, oldRoomId)
    scheduleRoomDirectorySync()
}

// 판이 방을 다시 열지 않고 끝남(점검 강제 종료·Node 비우는 중 등): 잡아 둔 키 놓음
function releaseHeldRoomCode(oldRoomId) {
    if (!heldRooms.delete(oldRoomId)) return
    scheduleRoomDirectorySync()
}

// Redis가 살아남·비었음 → 써 둔 방 전부 다시 쓰고 없어진 방은 지움 (MN-099·101)
cluster.onResync(() => {
    for (const entry of owned.values()) entry.writtenAt = -Infinity
    return reconcile()
})

// 시험용: 써 둔 기록 비우기
function __resetRoomDirectoryForTests() {
    owned.clear()
    heldRooms.clear()
    codeHandoffs.clear()
    queued = false
}

module.exports = {
    scheduleRoomDirectorySync,
    reconcileRoomDirectory: reconcile,
    reserveRoomCode,
    releaseRoomCode,
    markRoomStarted,
    clearRoomStarted,
    holdRoomCodeForGame,
    handOffHeldRoomCode,
    releaseHeldRoomCode,
    claimRoomCode: claimCode,
    __resetRoomDirectoryForTests,
}
