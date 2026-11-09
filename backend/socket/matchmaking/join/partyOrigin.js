// 끝난 판에서 온 이동 표시 파일
// 결과 화면에서 본인이 시작한 방 요청·입장 시도·자리 표시 + 확인, join·create·accept가 표시하고 room/sessionCleanup이 봄 (known 1-16)
const gameSession = require('../../../game-core/gameSession')
const { gameRooms, playerRoom, roomAdmissionAttempts, pendingRoomTransitions } = require('../core/state')

// 표시한 자리·입장 시도 객체 (객체가 사라지면 표시도 같이 사라짐)
// 서버가 끌어다 넣은 자동 입장은 표시 안 함 (결과 화면에서 로비로 나가면 그 방에서도 빠져야 해서)
const partyOriginObjects = new WeakSet()

// 표시한 방 전환 토큰 (토큰 풀 때 같이 지움)
const partyOriginTokens = new Set()

// 지금 끝난 판 결과 화면에 남아 있는 사람인지
function isInEndedGame(uuid) {
    return gameSession.getEndedGameId(uuid) !== null
}

// 끝난 판에서 시작한 요청이면 전환 토큰 표시
function markPartyOriginToken(uuid, token) {
    if (typeof token === 'string' && isInEndedGame(uuid)) partyOriginTokens.add(token)
}

// 토큰 풀 때 표시도 지움
function forgetPartyOriginToken(token) {
    partyOriginTokens.delete(token)
}

// 끝난 판에서 시작한 입장 시도·자리면 그 객체 표시
function markPartyOriginObject(uuid, target) {
    if (target && typeof target === 'object' && isInEndedGame(uuid)) partyOriginObjects.add(target)
}

// 끝난 판에서 온 이동 중이거나 그렇게 앉은 사람인지 (판 끝 정리가 건너뜀)
function hasPartyOrigin(uuid) {
    const token = pendingRoomTransitions.get(uuid)
    if (token !== undefined && partyOriginTokens.has(token)) return true
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt && partyOriginObjects.has(attempt)) return true
    const roomId = playerRoom.get(uuid)
    const seat = roomId ? gameRooms.get(roomId)?.players.get(uuid) : null
    return seat ? partyOriginObjects.has(seat) : false
}

module.exports = {
    isInEndedGame,
    markPartyOriginToken,
    forgetPartyOriginToken,
    markPartyOriginObject,
    hasPartyOrigin,
}
