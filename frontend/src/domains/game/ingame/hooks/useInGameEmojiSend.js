import { useCallback } from "react"

import { getSocket } from "../../../../shared/socket/socketClient.js"
import { isSameInGameReceiptScope, readInGameReceiptScope } from "../store/ingameStore.js"
import { inGameEmojiScopeKey, readInGameEmojiScope } from "../utils/selectInGameEmojiScope.js"

export const INGAME_EMOJI_SEND_UNAVAILABLE = "CONNECTION_UNAVAILABLE"

export const INGAME_EMOJI_SEND_ACK_FAILED = "ACK_FAILED"

export const INGAME_EMOJI_SEND_STALE = "STALE_SCOPE"

export function useInGameEmojiSend() {
  const send = useCallback(async (itemId) => {
    if (typeof itemId !== "string" || itemId.length === 0) {
      return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }
    }

    const requestScope = readInGameEmojiScope()
    if (requestScope === null) return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }

    const requestSocket = getSocket()
    if (!requestSocket || requestSocket.connected !== true || typeof requestSocket.emitWithAck !== "function") {
      return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }
    }

    const requestReceipt = readInGameReceiptScope({
      accountId: requestScope.accountId,
      identityGeneration: requestScope.identityGeneration,
    })

    let ack
    try {
      ack = await requestSocket.emitWithAck("send_emoji", {
        gameId: requestScope.gameId,
        itemId,
      })
    } catch (error) {
      return { ok: false, code: INGAME_EMOJI_SEND_ACK_FAILED }
    }

    if (getSocket() !== requestSocket) return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    const currentScope = readInGameEmojiScope()
    if (inGameEmojiScopeKey(currentScope) !== inGameEmojiScopeKey(requestScope)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }
    const currentReceipt = readInGameReceiptScope({
      accountId: currentScope.accountId,
      identityGeneration: currentScope.identityGeneration,
    })
    if (!isSameInGameReceiptScope(requestReceipt, currentReceipt)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }

    if (ack === null || typeof ack !== "object" || Array.isArray(ack)) {
      return { ok: false, code: INGAME_EMOJI_SEND_ACK_FAILED }
    }
    return ack
  }, [])

  return { send }
}
