// 강퇴 횟수 파일, 같은 방에서 쫓겨난 횟수 세기 · 다시 들어와도 되나 (사용자 결정 2026-11-09)
// room/host.js(강퇴 확정 때 셈)·join/join.js·admission/accept.js(입장 전 확인)가 씀

// 같은 방에서 이 횟수만큼 쫓겨나면 그 방엔 못 들어옴 (1·2번째는 다시 들어옴)
const ROOM_KICK_LIMIT = 3

// 방 → (사람 → 쫓겨난 횟수), 방 객체에 묶어서 방이 없어지면 기록도 같이 없어짐
const kickCountsByRoom = new WeakMap()

// 강퇴 확정 때 한 번 셈, 센 뒤 횟수 돌려줌
function recordRoomKick(room, uuid) {
    let counts = kickCountsByRoom.get(room)
    if (!counts) {
        counts = new Map()
        kickCountsByRoom.set(room, counts)
    }
    const next = (counts.get(uuid) ?? 0) + 1
    counts.set(uuid, next)
    return next
}

// 이 방에서 한도만큼 쫓겨났으면 true (입장 막음)
function isKickLimitReached(room, uuid) {
    return (kickCountsByRoom.get(room)?.get(uuid) ?? 0) >= ROOM_KICK_LIMIT
}

// 입장 거절 문구 (화면 문구표에 없을 때 그대로 띄움)
const KICK_LIMIT_MESSAGE = `이 방에서 ${ROOM_KICK_LIMIT}번 추방되어 더 이상 들어갈 수 없습니다.`

module.exports = {
    ROOM_KICK_LIMIT,
    KICK_LIMIT_MESSAGE,
    recordRoomKick,
    isKickLimitReached,
}
