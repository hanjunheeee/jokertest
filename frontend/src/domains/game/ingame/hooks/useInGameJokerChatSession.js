import { useEffect, useReducer, useRef, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { jokerChatReducer } from "../utils/jokerChatReducer.js"
import { selectJokerChatView } from "../utils/selectJokerChatView.js"
import { attachJokerChatListener } from "../utils/attachJokerChatListener.js"
import { sanitizeJokerChatText } from "../utils/sanitizeJokerChatText.js"
import { mapJokerChatSanitizeCodeToMessage } from "../utils/mapJokerChatSanitizeCodeToMessage.js"
import { toJokerChatUiMessage } from "../utils/toJokerChatUiMessage.js"
import { isJokerNightChatEligible } from "../utils/isJokerNightChatEligible.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"

const SEND_TIMEOUT_MS = 5000

const INITIAL_STATE = { gameId: null, messages: [], draft: "", status: "idle", error: null }

/** NIGHT 단계 JOKER 전용 실시간 채팅 세션. gameId 전환 원자성은 jokerChatReducer가 소유한다. */
export function useInGameJokerChatSession({ getPlayerById } = {}) {
  const [state, dispatch] = useReducer(jokerChatReducer, INITIAL_STATE)
  const externalGameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const mountedRef = useRef(true)
  const versionRef = useRef(0)
  const sendingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 전송 요청을 무효화하고 잠금을 즉시 해제한다(disconnect·gameId 변경·socket
  // 교체·unmount 네 지점 모두 이 함수 하나만 거친다).
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current = false
  }

  useEffect(() => {
    if (!socket) return undefined
    const handleDisconnect = () => invalidate()
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  useEffect(() => {
    invalidate()
    dispatch({ type: "GAME_CHANGED", gameId: externalGameId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalGameId])

  useEffect(() => {
    if (!socket || !isJokerNightChatEligible(gameState)) return undefined
    return attachJokerChatListener(
      socket,
      (parsed) =>
        dispatch({
          type: "RECEIVE",
          gameId: parsed.gameId,
          message: { id: parsed.id, senderUuid: parsed.senderUuid, text: parsed.text, sentAt: parsed.sentAt },
        }),
      () => useInGameStore.getState().gameId,
    )
  }, [socket, gameState])

  const send = () => {
    if (sendingRef.current) return
    if (!isJokerNightChatEligible(gameState)) return

    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) return

    const requestGameId = externalGameId
    if (!requestGameId) return

    const requestDraft = selectJokerChatView(state, externalGameId).draft

    const sanitized = sanitizeJokerChatText(requestDraft)
    if (!sanitized.ok) {
      dispatch({
        type: "ACK",
        gameId: requestGameId,
        ok: false,
        message: mapJokerChatSanitizeCodeToMessage(sanitized.code),
        requestDraft,
      })
      return
    }

    versionRef.current += 1
    const requestVersion = versionRef.current
    sendingRef.current = true
    dispatch({ type: "SEND", gameId: requestGameId })

    const isStale = () =>
      isStaleRoleRevealAckResponse({
        mounted: mountedRef.current,
        requestVersion,
        currentVersion: versionRef.current,
        requestSocket,
        currentSocket: getSocket(),
        requestGameId,
        currentGameId: useInGameStore.getState().gameId,
      })

    requestSocket
      .timeout(SEND_TIMEOUT_MS)
      .emitWithAck("submit_joker_chat_message", { gameId: requestGameId, text: sanitized.text })
      .then((response) => {
        if (isStale()) return
        dispatch({
          type: "ACK",
          gameId: requestGameId,
          ok: !!response?.ok,
          message: response?.message ?? "제출하지 못했습니다.",
          requestDraft,
        })
      })
      .catch(() => {
        if (isStale()) return
        dispatch({
          type: "ACK",
          gameId: requestGameId,
          ok: false,
          message: "요청이 응답하지 않습니다. 다시 시도해주세요.",
          requestDraft,
        })
      })
      .finally(() => {
        if (requestVersion === versionRef.current) {
          sendingRef.current = false
        }
      })
  }

  const view = selectJokerChatView(state, externalGameId)

  return {
    draft: view.draft,
    setDraft: (draft) => dispatch({ type: "DRAFT", gameId: externalGameId, draft }),
    messages: view.messages.map((m) => toJokerChatUiMessage(m, getPlayerById)).filter(Boolean),
    send,
    status: view.status,
    error: view.error,
  }
}
