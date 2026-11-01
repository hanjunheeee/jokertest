// 이모지 보내기 훅: 보낸 뒤 소켓·판·수신 범위가 그대로일 때만 응답을 돌려줌
// 이모지 팔레트가 사용, 보내기는 socket/session.js를 부름
import { useCallback } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { isSameReceiptScope, readInGameReceiptScope } from "../store/ingameStore.js"
import { inGameEmojiScopeKey, readEmojiScope } from "../utils/selectInGameEmojiScope.js"
import { emitEmoji } from "../socket/session.js"

export const SEND_UNAVAILABLE = "CONNECTION_UNAVAILABLE"

export const ACK_FAILED = "ACK_FAILED"

export const INGAME_EMOJI_SEND_STALE = "STALE_SCOPE"

export function useInGameEmojiSend() {
  const send = useCallback(async (itemId) => {
    if (typeof itemId !== "string" || itemId.length === 0) {
      return { ok: false, code: SEND_UNAVAILABLE }
    }

    const requestScope = readEmojiScope()
    if (requestScope === null) return { ok: false, code: SEND_UNAVAILABLE }

    const requestSocket = getSocket()
    if (!requestSocket || requestSocket.connected !== true || typeof requestSocket.emitWithAck !== "function") {
      return { ok: false, code: SEND_UNAVAILABLE }
    }

    const requestReceipt = readInGameReceiptScope({
      accountId: requestScope.accountId,
      identityGeneration: requestScope.identityGeneration,
    })

    let ack
    try {
      ack = await emitEmoji(requestSocket, {
        gameId: requestScope.gameId,
        itemId,
      })
    } catch {
      return { ok: false, code: ACK_FAILED }
    }

    // 기다리는 사이 소켓·판·수신 범위가 바뀌었으면 옛 응답으로 봄
    if (getSocket() !== requestSocket) return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    const currentScope = readEmojiScope()
    if (inGameEmojiScopeKey(currentScope) !== inGameEmojiScopeKey(requestScope)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }
    const currentReceipt = readInGameReceiptScope({
      accountId: currentScope.accountId,
      identityGeneration: currentScope.identityGeneration,
    })
    if (!isSameReceiptScope(requestReceipt, currentReceipt)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }

    if (ack === null || typeof ack !== "object" || Array.isArray(ack)) {
      return { ok: false, code: ACK_FAILED }
    }
    return ack
  }, [])

  return { send }
}
