// 이모지 보내기 훅: 보낸 뒤 소켓·판·수신 범위가 그대로일 때만 응답을 돌려줌
// 이모지 팔레트(InGameEmojiPalette)가 사용, 보내기는 socket/session.js를 부름
import { useCallback } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { isSameReceiptScope, readInGameReceiptScope } from "../store/ingameStore.js"
import { inGameEmojiScopeKey, readEmojiScope } from "../utils/selectInGameEmojiScope.js"
import { emitEmoji } from "../socket/session.js"

// 보내기 결과 코드: 못 보냄·응답 실패·옛 범위
export const SEND_UNAVAILABLE = "CONNECTION_UNAVAILABLE"

export const ACK_FAILED = "ACK_FAILED"

export const INGAME_EMOJI_SEND_STALE = "STALE_SCOPE"

// 이모지 하나 보내고 결과 돌려줌
export function useInGameEmojiSend() {
  const send = useCallback(async (itemId) => {
    // 이모지 id·내 판 범위·연결이 없으면 안 보냄
    if (typeof itemId !== "string" || itemId.length === 0) {
      return { ok: false, code: SEND_UNAVAILABLE }
    }

    const requestScope = readEmojiScope()
    if (requestScope === null) return { ok: false, code: SEND_UNAVAILABLE }

    const requestSocket = getSocket()
    if (!requestSocket || requestSocket.connected !== true || typeof requestSocket.emitWithAck !== "function") {
      return { ok: false, code: SEND_UNAVAILABLE }
    }

    // 보낼 때 수신 범위 잡아 둠 (응답 때 비교)
    const requestReceipt = readInGameReceiptScope({
      accountId: requestScope.accountId,
      identityGeneration: requestScope.identityGeneration,
    })

    // 응답 못 받으면 실패
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

    // 응답 모양이 틀리면 실패
    if (ack === null || typeof ack !== "object" || Array.isArray(ack)) {
      return { ok: false, code: ACK_FAILED }
    }
    return ack
  }, [])

  return { send }
}
