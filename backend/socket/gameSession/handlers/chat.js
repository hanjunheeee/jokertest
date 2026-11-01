// 채팅·이모티콘 핸들러 파일
// 조커 채팅 · 낮·죽은 사람 채팅 · 이모티콘 보내기 (지도 13), register가 등록함
const { randomUUID } = require('node:crypto')
const gameSessionCore = require('../../../game-core/gameSession')
const { attempt } = require('../../common/isolate')
const { rejectedReply, respond, labeledResponder } = require('../../common/replies')
const {
    JOKER_INTERNAL_CODES,
    CHAT_INTERNAL_CODES,
    CHAT_NON_PUBLIC_CODES,
    CHAT_EVENT_BY_CHANNEL,
} = require('../core/constants')
const {
    pickGameText,
    pickGameItem,
    readRequest,
    acceptRequest,
    acceptCoreResult,
    prepareLogs,
    commitLogs,
    internalFailure,
} = require('../core/requests')
const { isEligibleRecipient } = require('../delivery/eligibility')
const {
    emitToGameChannel,
    resolveChatRecipientSockets,
    resolveJokerTeammateSockets,
    emitToEachEligible,
} = require('../delivery/broadcast')

// 조커 채팅 ack
const respondJokerChat = labeledResponder('[조커 채팅 오류]')

// 조커 채팅: 같은 편 소켓 정하고 확정한 뒤 하나씩 보냄 (지도 13)
function handleSubmitJokerChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareJokerChatMessage
    const commit = deps.commit ?? gameSessionCore.commitJokerChatMessage
    const resolveTeammateSockets = deps.resolveTeammateSockets ?? resolveJokerTeammateSockets
    const idFn = deps.idFn ?? randomUUID
    const label = '[조커 채팅 오류]'

    if (typeof callback !== 'function') return
    const ack = (body, gameId) => respondJokerChat(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 13-②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameText)
    if (!fields) return
    const { gameId, text } = fields

    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, text),
        prepareLogs(label, uuid, JOKER_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 판 id는 prepare가 돌려준 진짜 id로 답함
    const ackInSession = (body) => ack(body, prepared.session.id)
    const failInternally = internalFailure(label, uuid, prepared.session.id, ackInSession)

    const teammates = attempt(() => resolveTeammateSockets(
        io,
        prepared.session,
        prepared.channel ?? gameSessionCore.CHAT_CHANNELS.JOKER,
    ))
    if (teammates.threw) {
        failInternally('RECIPIENT_RESOLVE_ERROR')
        return
    }
    const teammateSockets = teammates.value

    // 받는 사람 목록에 보낸 사람이 없으면 계산이 꼬인 것 (지도 13-⑦)
    if (!teammateSockets.some((s) => s === socket)) {
        failInternally('SENDER_NOT_IN_RECIPIENTS')
        return
    }

    const generated = attempt(() => idFn())
    if (generated.threw) {
        failInternally('ID_GENERATION_ERROR')
        return
    }
    const rawMessageId = generated.value
    if (typeof rawMessageId !== 'string' || rawMessageId.trim().length === 0) {
        failInternally('INVALID_MESSAGE_ID')
        return
    }
    const messageId = rawMessageId.trim()

    const committed = acceptCoreResult(ackInSession, () => commit(prepared.session, uuid, prepared.sentAt),
        commitLogs(label, uuid, prepared.session.id))
    if (!committed) return

    ackInSession({ ok: true })

    emitToEachEligible(prepared.session, teammateSockets, label, { uuid: prepared.actorUuid, gameId: prepared.session.id },
        (teammateSocket) => teammateSocket.emit('joker_chat_message', {
            gameId: prepared.session.id,
            senderUuid: prepared.actorUuid,
            text: prepared.sanitizedText,
            messageId,
            sentAt: prepared.sentAt,
        }))
}

// 낮·죽은 사람 채팅 ack
const respondGameChat = labeledResponder('[게임 채팅 오류]')

// 낮·죽은 사람 채팅: 받을 사람 정하고 확정한 뒤 소켓마다 하나씩 보냄
function handleSubmitGameChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareGameChatMessage
    const commit = deps.commit ?? gameSessionCore.commitGameChatMessage
    const resolveRecipientSockets = deps.resolveRecipientSockets ?? resolveChatRecipientSockets
    const idFn = deps.idFn ?? randomUUID

    if (typeof callback !== 'function') return
    const ack = (body, gameId) => respondGameChat(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 13-②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameText)
    if (!fields) return
    const { gameId, text } = fields
    const label = '[게임 채팅 오류]'

    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, text, { idFn }),
        prepareLogs(label, uuid, CHAT_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 판 id는 prepare가 돌려준 진짜 id로 답함
    const ackInSession = (body) => ack(body, prepared.session.id)
    const failInternally = internalFailure(label, uuid, prepared.session.id, ackInSession)

    const recipients = attempt(() => resolveRecipientSockets(io, prepared.session, prepared.channel))
    if (recipients.threw) {
        failInternally('RECIPIENT_RESOLVE_ERROR')
        return
    }
    const recipientSockets = recipients.value

    // 받는 사람 목록에 보낸 사람이 없으면 계산이 꼬인 것 (지도 13-⑦)
    if (!recipientSockets.some((s) => s === socket)) {
        failInternally('SENDER_NOT_IN_RECIPIENTS')
        return
    }

    const eventName = CHAT_EVENT_BY_CHANNEL[prepared.channel]
    if (typeof eventName !== 'string') {
        failInternally('INVALID_CHAT_CHANNEL')
        return
    }

    // 끝난 판만 그대로 알려 주고 나머지 commit 실패는 내부 사정
    const committed = acceptCoreResult(ackInSession, () => commit(prepared),
        commitLogs(label, uuid, prepared.session.id, CHAT_NON_PUBLIC_CODES))
    if (!committed) return

    const outbound = committed.message
    if (typeof outbound !== 'object' || outbound === null) {
        failInternally('INVALID_CHAT_MESSAGE')
        return
    }

    ackInSession({ ok: true })

    emitToEachEligible(prepared.session, recipientSockets, label, { uuid: outbound.senderUuid, gameId: outbound.gameId },
        (recipientSocket) => recipientSocket.emit(eventName, {
            gameId: outbound.gameId,
            messageId: outbound.messageId,
            senderUuid: outbound.senderUuid,
            nickname: outbound.nickname,
            text: outbound.text,
            sentAt: outbound.sentAt,
            dayIndex: outbound.dayIndex,
        }))
}

// 이모티콘 보내기: 판에 있고 가진 것·팔레트에 넣은 것만, 너무 빠르면 거절 (지도 13-⑤)
function handleSendEmoji(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
    const reject = (code) => respond(callback, rejectedReply(code))

    // 지금 소켓·요청 모양 (이모티콘은 거절 문구가 하나)
    const request = readRequest(uuid, socket, payload, pickGameItem)
    if (request.code) {
        reject(request.code)
        return
    }
    const { gameId, itemId } = request.fields

    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !isEligibleRecipient(session, socket, uuid)) {
        reject('NOT_PARTICIPANT')
        return
    }

    if (!gameSessionCore.assertSessionNotEnded(session).ok) {
        reject('GAME_ENDED')
        return
    }

    const sentAt = Date.now()
    const rateLimit = session.emojiRateLimit instanceof Map ? session.emojiRateLimit : null
    const lastSentAt = rateLimit?.get(uuid)
    if (typeof lastSentAt === 'number' && sentAt - lastSentAt < gameSessionCore.EMOJI_MIN_INTERVAL_MS) {
        reject('RATE_LIMITED')
        return
    }

    const palette = session.emojiPaletteByUuid instanceof Map
        ? session.emojiPaletteByUuid.get(uuid)
        : null
    if (!Array.isArray(palette?.owned) || !palette.owned.includes(itemId)) {
        reject('NOT_OWNED')
        return
    }
    if (!Array.isArray(palette.slots) || !palette.slots.includes(itemId)) {
        reject('NOT_IN_PALETTE')
        return
    }

    // 여기부터 진짜 바뀜: 보낸 시각 기록, 판 전체에 말풍선
    rateLimit?.set(uuid, sentAt)
    emitToGameChannel(io, session, 'emoji_shown', { gameId: session.id, uuid, itemId, sentAt })
    respond(callback, { ok: true, sentAt })
}

module.exports = {
    handleSubmitJokerChatMessage,
    handleSubmitGameChatMessage,
    handleSendEmoji,
}
