// 이모티콘 핸들러 파일
// 판 안 이모티콘 말풍선 보내기 (지도 13-⑤), register가 등록·시험은 gameSession.js로 바로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { rejectedReply, respond } = require('../../common/replies')
const { pickGameItem, readRequest } = require('../core/requests')
const { isEligibleRecipient } = require('../delivery/eligibility')
const { emitToGameChannel } = require('../delivery/broadcast')

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

    // 죽은 사람은 안 됨 (말풍선이 산 사람 포함 판 전체에 떠서 죽은 뒤 신호 주기 막기, BE-022)
    if (session.players.get(uuid)?.alive !== true) {
        reject('PLAYER_NOT_ALIVE')
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
    handleSendEmoji,
}
