// 채팅·이모티콘 핸들러 파일
// 조커 채팅 · 낮 채팅 · 이모티콘 보내기 (지도 13), register가 등록·시험은 gameSession.js로 바로 부름
// 채팅은 받을 소켓·id 먼저 정하고 commit (확정 전 실패면 아무것도 안 바뀜)
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

// 조커 채팅(밤에 같은 역할끼리): 받을 소켓·id 정하고 확정한 뒤 하나씩 보냄 (지도 13)
function handleSubmitJokerChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    // 시험이 prepare·commit·받는 소켓·id 함수를 바꿔 끼움
    const prepare = deps.prepare ?? gameSessionCore.prepareJokerChatMessage
    const commit = deps.commit ?? gameSessionCore.commitJokerChatMessage
    const resolveTeammateSockets = deps.resolveTeammateSockets ?? resolveJokerTeammateSockets
    const idFn = deps.idFn ?? randomUUID
    const label = '[조커 채팅 오류]'

    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 판 id는 prepare 뒤에만 로그에 찍음 (요청 값은 못 믿음)
    const ack = (body, gameId) => respondJokerChat(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 13-②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameText)
    if (!fields) return
    const { gameId, text } = fields

    // prepare: 검사만, 아직 기록 안 함 (내부 사정 코드는 INTERNAL_ERROR로 숨김)
    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, text),
        prepareLogs(label, uuid, JOKER_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 ack·실패 로그엔 prepare가 찾은 진짜 판 id
    const ackInSession = (body) => ack(body, prepared.session.id)
    const failInternally = internalFailure(label, uuid, prepared.session.id, ackInSession)

    // 받을 같은 역할 소켓 모으기, 던지면 확정 전이라 내부 오류로 끝
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

    // 메시지 id 만들기, 던지거나 빈 값이면 확정 전에 내부 오류
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

    // 여기부터 진짜 바뀜: 보낸 시각 기록 (다음 채팅 간격 기준)
    const committed = acceptCoreResult(ackInSession, () => commit(prepared.session, uuid, prepared.sentAt),
        commitLogs(label, uuid, prepared.session.id))
    if (!committed) return

    // 답 먼저, 그다음 소켓마다 보내기 직전 자격 다시 보고 하나씩
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

// 낮 채팅 ack
const respondGameChat = labeledResponder('[게임 채팅 오류]')

// 낮 채팅(낮·재판, 산 사람만): 받을 사람 정하고 확정한 뒤 소켓마다 하나씩 보냄
function handleSubmitGameChatMessage(io, socket, uuid, payload, callback, deps = {}) {
    // 시험이 prepare·commit·받는 소켓·id 함수를 바꿔 끼움 (id는 prepare가 만듦)
    const prepare = deps.prepare ?? gameSessionCore.prepareGameChatMessage
    const commit = deps.commit ?? gameSessionCore.commitGameChatMessage
    const resolveRecipientSockets = deps.resolveRecipientSockets ?? resolveChatRecipientSockets
    const idFn = deps.idFn ?? randomUUID

    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 판 id는 prepare 뒤에만 로그에 찍음 (요청 값은 못 믿음)
    const ack = (body, gameId) => respondGameChat(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 13-②)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameText)
    if (!fields) return
    const { gameId, text } = fields
    const label = '[게임 채팅 오류]'

    // prepare: 검사 + 메시지·id 만들기, 아직 기록 안 함
    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, text, { idFn }),
        prepareLogs(label, uuid, CHAT_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 ack·실패 로그엔 prepare가 찾은 진짜 판 id
    const ackInSession = (body) => ack(body, prepared.session.id)
    const failInternally = internalFailure(label, uuid, prepared.session.id, ackInSession)

    // 받을 소켓 모으기, 던지면 확정 전이라 내부 오류로 끝
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

    // 채널에 맞는 이벤트 이름, 모르는 채널이면 확정 전에 내부 오류
    const eventName = CHAT_EVENT_BY_CHANNEL[prepared.channel]
    if (typeof eventName !== 'string') {
        failInternally('INVALID_CHAT_CHANNEL')
        return
    }

    // 끝난 판만 그대로 알려 주고 나머지 commit 실패는 내부 사정
    const committed = acceptCoreResult(ackInSession, () => commit(prepared),
        commitLogs(label, uuid, prepared.session.id, CHAT_NON_PUBLIC_CODES))
    if (!committed) return

    // 확정 결과에 메시지가 없으면 방송 없이 내부 오류
    const outbound = committed.message
    if (typeof outbound !== 'object' || outbound === null) {
        failInternally('INVALID_CHAT_MESSAGE')
        return
    }

    // 답 먼저, 그다음 소켓마다 보내기 직전 자격 다시 보고 하나씩
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
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // 거절 답 (코드만 바뀜)
    const reject = (code) => respond(callback, rejectedReply(code))

    // 지금 소켓·요청 모양 (이모티콘은 거절 문구가 하나)
    const request = readRequest(uuid, socket, payload, pickGameItem)
    if (request.code) {
        reject(request.code)
        return
    }
    const { gameId, itemId } = request.fields

    // 판에 참여 중이고 이 소켓이 지금 판 채널 소켓인지 (옛 탭·채널 밖 소켓 막기)
    const session = gameSessionCore.getActiveSessionForDeparture(uuid, gameId)
    if (!session || !isEligibleRecipient(session, socket, uuid)) {
        reject('NOT_PARTICIPANT')
        return
    }

    // 끝난 판(결과 화면)도 위에서 찾아지니 따로 거절
    if (!gameSessionCore.assertSessionNotEnded(session).ok) {
        reject('GAME_ENDED')
        return
    }

    // 마지막으로 보낸 지 너무 짧으면 거절 (말풍선 도배 막기)
    const sentAt = Date.now()
    const rateLimit = session.emojiRateLimit instanceof Map ? session.emojiRateLimit : null
    const lastSentAt = rateLimit?.get(uuid)
    if (typeof lastSentAt === 'number' && sentAt - lastSentAt < gameSessionCore.EMOJI_MIN_INTERVAL_MS) {
        reject('RATE_LIMITED')
        return
    }

    // 가진 이모티콘이고 팔레트에 넣은 것만 (보낸 id 그대로 안 믿음)
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
