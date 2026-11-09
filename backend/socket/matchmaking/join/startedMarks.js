// 시작된 방 표시 파일
// 시작돼 사라진 방 코드·id 기억 + 확인 ("이미 시작" vs "방 없음", 지도 01-⑤)
// room/start가 기억, join·guards(코드 겹침)가 확인
// Node 여러 개면 Redis startedcode:<CODE>에도 남김 (다른 Node 코드 입장도 "이미 시작", MN-015)
const { startedRoomMarks } = require('../core/state')
const { markRoomStarted } = require('../cluster/roomDirectory')

// 표시 30분 보관
const STARTED_ROOM_MARK_TTL_MS = 30 * 60 * 1000

// 시작된 방 id → 방 코드 (방 id만 받은 입장도 판 상태를 코드로 찾게, 표시와 같이 지움)
const startedRoomCodes = new Map()

// 기한 지난 표시 지움 (새로 기억할 때 같이 치움, 따로 타이머 없음)
function pruneStartedRoomMarks(now) {
    const threshold = now - STARTED_ROOM_MARK_TTL_MS
    for (const [mark, startedAt] of startedRoomMarks) {
        if (startedAt <= threshold) startedRoomMarks.delete(mark)
    }
    for (const roomId of startedRoomCodes.keys()) {
        if (!startedRoomMarks.has(`id:${roomId}`)) startedRoomCodes.delete(roomId)
    }
}

// 게임 시작한 방 코드·id 기억 (방 id 받은 입장은 id로, 코드만 받은 입장은 코드로 찾음), gameId는 Node 여러 개일 때 디렉터리용
function rememberStartedRoom(room, gameId = null) {
    const now = Date.now()
    pruneStartedRoomMarks(now)
    if (typeof room?.code === 'string' && room.code) startedRoomMarks.set(`code:${room.code}`, now)
    if (typeof room?.id === 'string' && room.id) startedRoomMarks.set(`id:${room.id}`, now)
    if (typeof room?.id === 'string' && room.id && typeof room?.code === 'string' && room.code) {
        startedRoomCodes.set(room.id, room.code)
    }
    markRoomStarted(room, gameId)
}

// 시작된 방의 코드 (표시가 살아 있을 때만)
function getStartedRoomCode(roomId) {
    if (!isStartedRoomMark(`id:${roomId}`)) return null
    return startedRoomCodes.get(roomId) ?? null
}

// 시험용: 표시 전부 지움
function __resetStartedMarksForTests() {
    startedRoomMarks.clear()
    startedRoomCodes.clear()
}

// 이 코드·id가 시작돼 사라진 방인지 (기한 지났으면 지우고 아님)
function isStartedRoomMark(mark) {
    const startedAt = startedRoomMarks.get(mark)
    if (startedAt === undefined) return false
    if (startedAt <= Date.now() - STARTED_ROOM_MARK_TTL_MS) {
        startedRoomMarks.delete(mark)
        return false
    }
    return true
}

module.exports = {
    STARTED_ROOM_MARK_TTL_MS,
    pruneStartedRoomMarks,
    rememberStartedRoom,
    getStartedRoomCode,
    __resetStartedMarksForTests,
    isStartedRoomMark,
}
