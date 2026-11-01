// 판 방송 받을 자격 파일
// 이 소켓이 지금 판 방송 받을 자격 있는지 + 판 밖 소속·판 채널 주인 판정, socket gameSession 방송·채널 떼기가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const matchmaking = require('../../matchmaking')
const channelMembership = require('../../channelMembership')
const { isNonEmptyString } = require('../../common/shape')
const { tryOr } = require('../../common/isolate')
const { hasOnlineUsersRegistry, isCurrentSocketForUuid } = require('../connection/ownership')

// 이 소켓이 지금 이 판 방송 받을 자격 있는지: 참여 중·연결됨·지금 소켓·채널 안·제외 아님 (종료 문맥이 있으면 그것도 봄)
function isEligibleSessionRecipient(session, socket, uuid, endContext = null) {
    if (!session || !socket) return false
    if (!isNonEmptyString(uuid)) return false
    if (!gameSessionCore.isParticipatingInSession(session, uuid)) return false
    if (endContext && !isEligibleSessionEndRecipient(session, uuid, endContext)) return false
    if (socket.connected !== true) return false
    if (hasOnlineUsersRegistry() && !isCurrentSocketForUuid(uuid, socket)) return false
    if (!socket.rooms?.has?.(session.channelId)) return false
    if (typeof socket.id === 'string'
        && channelMembership.isSocketExcludedFromChannel(session.channelId, socket.id)) {
        return false
    }
    return true
}

// 보내기 직전 다시 보기: 소켓에 붙은 계정으로 자격 판정
function stillEligibleForDelivery(session, recipientSocket) {
    return isEligibleSessionRecipient(session, recipientSocket, recipientSocket?.data?.user?.uuid ?? null)
}

// 이 판 받을 자격 있고 다른 판·대기방 소속은 없는지 (개인 사건·대기 알림 받을 사람 고르기)
function isSessionOnlyRecipient(session, socket, uuid) {
    if (!stillEligibleForDelivery(session, socket)) return false
    return !hasMembershipOutsideSession(session, uuid)
}

// matchmaking 대기방 소속 묻기, 던지면 소속 없음으로 봄
function isInMatchmakingRoom(uuid) {
    return tryOr(false, () => matchmaking.hasRoomMembership(uuid) === true)
}

// 이 판 말고 다른 판·대기방 소속이 생겼는지 (생겼으면 이 판 방송은 안 보냄, 지도 06-⑧)
function hasMembershipOutsideSession(session, uuid) {
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (routing && routing.gameId !== session.id) return true
    return isInMatchmakingRoom(uuid)
}

// 종료 방송 받을 자격: 그 판 문맥·허용 명단 안·미리 빠진 사람 아님·다른 소속 없음
function isEligibleSessionEndRecipient(session, uuid, endContext) {
    if (endContext.gameId !== session.id) return false
    if (!endContext.allowed.has(uuid)) return false
    if (endContext.preExcluded.has(uuid)) return false
    if (hasMembershipOutsideSession(session, uuid)) return false
    return true
}

// 종료 방송 문맥 만들기: 정리 대상 중 참여 중인 사람을 허용·미리 빠짐으로 나눔 (나간 사람은 뺌, 정리 전에 정해 둠)
function buildSessionEndContext(session, leftUuid, cleanupUuids) {
    const allowed = new Set()
    const preExcluded = new Set()
    for (const candidate of cleanupUuids ?? []) {
        if (!isNonEmptyString(candidate)) continue
        if (candidate === leftUuid) continue
        if (!gameSessionCore.isParticipatingInSession(session, candidate)) continue
        if (hasMembershipOutsideSession(session, candidate)) {
            preExcluded.add(candidate)
            continue
        }
        allowed.add(candidate)
    }
    return { gameId: session.id, channelId: session.channelId, allowed, preExcluded }
}

// 지금 소켓이 아직 그 판 채널 주인인지 (떼는 사이 같은 채널을 다시 가졌는지 판정용)
function ownsSessionChannelNow(socket, uuid, channelId) {
    const routing = liveSessionRoutingFor(socket, uuid)
    return routing !== null && routing.channelId === channelId
}

// 지금 소켓의 살아 있는 판 routing, 기권했으면 null
function liveSessionRoutingFor(socket, uuid) {
    if (!isCurrentSocketForUuid(uuid, socket)) return null
    const routing = gameSessionCore.getActiveSessionRoutingInfo(uuid)
    if (!routing) return null
    return gameSessionCore.isForfeitedFromSession(routing.gameId, uuid) ? null : routing
}

// 지금 소켓이 판이든 대기방이든 아직 소속이 있는지 (있으면 채널 떼기 실패해도 연결은 유지)
function socketHasLiveMembership(socket, uuid) {
    if (liveSessionRoutingFor(socket, uuid) !== null) return true
    if (!isCurrentSocketForUuid(uuid, socket)) return false
    return isInMatchmakingRoom(uuid)
}

module.exports = {
    isEligibleSessionRecipient,
    stillEligibleForDelivery,
    isSessionOnlyRecipient,
    isInMatchmakingRoom,
    hasMembershipOutsideSession,
    isEligibleSessionEndRecipient,
    buildSessionEndContext,
    ownsSessionChannelNow,
    liveSessionRoutingFor,
    socketHasLiveMembership,
}
