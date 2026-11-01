// 판 방송 파일
// 판 채널 방송·받을 소켓 모아 하나씩 보내기 + 판 채널 떼기, socket gameSession 핸들러·타이머가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const channelMembership = require('../../channelMembership')
const { isNonEmptyString } = require('../../common/shape')
const { isolate, isolateOr } = require('../../common/isolate')
const {
    isEligibleSessionRecipient,
    stillEligibleForDelivery,
    ownsSessionChannelNow,
    socketHasLiveMembership,
} = require('./eligibility')

// 채널 떼기는 채널 소속 쪽에 맡김 (시험이 __testables로 바로 부름)
function detachSocketFromChannel(socket, channelId, logLabel, logFields = {}, ownership = null) {
    channelMembership.detachSocketFromChannel(socket, channelId, logLabel, logFields, ownership)
}

// 판 채널에서 떼기: 그사이 같은 채널을 다시 가졌으면 되돌리고, 다른 소속 남았으면 연결 유지 (지도 08-⑨ · 12-⑧)
function detachFromSessionChannel(socket, uuid, channelId, logLabel, logFields) {
    detachSocketFromChannel(socket, channelId, logLabel, logFields, {
        ownsChannel: () => ownsSessionChannelNow(socket, uuid, channelId),
        keepsConnection: () => socketHasLiveMembership(socket, uuid),
    })
}

// 채널 안 소켓 중 이 판 방송 받을 자격 없는 것 (방송에서 뺄 목록)
function collectIneligibleChannelSocketIds(io, session, endContext = null) {
    const ineligible = []
    const registry = io?.sockets?.sockets
    if (!registry || typeof registry.values !== 'function') return ineligible
    for (const s of [...registry.values()]) {
        if (typeof s?.id !== 'string') continue
        if (!s.rooms?.has?.(session.channelId)) continue
        if (isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)) continue
        ineligible.push(s.id)
    }
    return ineligible
}

// 판 채널 방송: 자격 없는 소켓은 빼고, 종료 방송이면 받는 쪽마다 다시 봄 (판 문맥 없으면 폐기)
function emitToGameChannel(io, session, event, payload, endContext = null) {
    if (!session || typeof session !== 'object') {
        console.error('[게임 방송 폐기 · 세션 문맥 없음]', { code: 'GAME_EMIT_NO_SESSION_CONTEXT', event })
        return
    }
    const channelId = session.channelId
    if (!isNonEmptyString(channelId)) return
    const exceptSocketIds = collectIneligibleChannelSocketIds(io, session, endContext)
    const options = {}
    if (exceptSocketIds.length > 0) options.exceptSocketIds = exceptSocketIds
    if (endContext) {
        options.recipientFilter = (s) =>
            isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null, endContext)
    }
    channelMembership.emitToChannel(
        io, channelId, event, payload,
        Object.keys(options).length > 0 ? options : null,
    )
}

// 판 참가자 소켓: 지금 받을 자격 있는 것만
function resolveSessionParticipantSockets(io, session) {
    const sockets = []
    for (const s of io.sockets.sockets.values()) {
        if (!isEligibleSessionRecipient(session, s, s.data?.user?.uuid ?? null)) continue
        sockets.push(s)
    }
    return sockets
}

// 채팅 받을 소켓: 판 참가자 소켓 중 그 채널 받을 계정만 (지도 13-⑥)
function resolveChatRecipientSockets(io, session, channel) {
    const eligibleUuids = new Set(gameSessionCore.getChatRecipientUuids(session, channel))
    return resolveSessionParticipantSockets(io, session)
        .filter((s) => eligibleUuids.has(s.data?.user?.uuid ?? null))
}

// 조커 채팅 받을 같은 편 소켓 (채널 안 주면 조커 채널)
function resolveJokerTeammateSockets(io, session, channel = gameSessionCore.CHAT_CHANNELS.JOKER) {
    return resolveChatRecipientSockets(io, session, channel)
}

// 받을 소켓 모으기, 던지면 로그 찍고 빈 목록 (방송만 빠지고 진행은 계속)
function resolveRecipientsOrEmpty(io, session, label, fields, resolve = resolveSessionParticipantSockets) {
    return isolateOr([], label, { code: 'RECIPIENT_RESOLVE_ERROR', ...fields }, () => resolve(io, session))
}

// 소켓마다 보내기 직전 자격 다시 보고 하나씩 보냄, 한 소켓 실패가 나머지를 막지 않음 (지도 06-⑧ · 12-⑨)
function emitToEachEligible(session, sockets, label, fields, send) {
    for (const recipientSocket of sockets) {
        if (!stillEligibleForDelivery(session, recipientSocket)) continue
        isolate(label, { code: 'DELIVERY_ERROR', ...fields }, () => send(recipientSocket))
    }
}

// 판 참가자 전원에게 같은 내용 하나씩 보냄 (모으기·보내기 실패는 로그만)
function deliverToParticipants(io, session, event, payload, label, fields) {
    const recipients = resolveRecipientsOrEmpty(io, session, label, fields)
    emitToEachEligible(session, recipients, label, fields, (s) => s.emit(event, payload))
}

module.exports = {
    detachSocketFromChannel,
    detachFromSessionChannel,
    collectIneligibleChannelSocketIds,
    emitToGameChannel,
    resolveSessionParticipantSockets,
    resolveChatRecipientSockets,
    resolveJokerTeammateSockets,
    resolveRecipientsOrEmpty,
    emitToEachEligible,
    deliverToParticipants,
}
