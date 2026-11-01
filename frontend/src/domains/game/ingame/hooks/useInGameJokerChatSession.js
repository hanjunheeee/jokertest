// 조커 밤 채팅 세션 훅: 조커끼리 밤 채팅 받기·보내기와 입력 상태
// 채팅 틀 속성 훅(useInGameChatShellProps)이 사용, 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useReducer, useRef, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { jokerChatReducer, selectJokerChatView } from "../utils/jokerChatReducer.js"
import { attachJokerChatListener, toJokerChatUiMessage } from "../utils/jokerChatReceive.js"
import { sanitizeJokerChatText, mapJokerChatSanitizeCodeToMessage } from "../utils/chatText.js"
import { isJokerNightChatEligible } from "../utils/selfAlive.js"
import { isStaleRoleRevealAckResponse } from "../utils/staleAck.js"
import { onDisconnect } from "../socket/connection.js"
import { emitJokerChat } from "../socket/chat.js"

// 보내기 응답 기다리는 시간과 채팅 처음 상태
const SEND_TIMEOUT_MS = 5000

const INITIAL_STATE = { gameId: null, messages: [], draft: "", status: "idle", error: null }

// 조커 밤 채팅 입력·메시지·보내기 (판 바뀌면 비움)
export function useInGameJokerChatSession({ getPlayerById } = {}) {
  const [state, dispatch] = useReducer(jokerChatReducer, INITIAL_STATE)
  const externalGameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 화면 살아 있음·보내기 세대·보내는 중
  const mountedRef = useRef(true)
  const versionRef = useRef(0)
  const sendingRef = useRef(false)

  // 화면 빠진 뒤엔 응답 반영 안 하게 표시
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 세대 올려서 보낸 메시지의 응답을 버림
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current = false
  }

  // 연결 끊기거나 소켓 바뀌면 보낸 메시지 응답 버림
  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
  }, [socket])

  // 판 바뀌면 응답 버리고 채팅 비움
  useEffect(() => {
    invalidate()
    dispatch({ type: "GAME_CHANGED", gameId: externalGameId })
  }, [externalGameId])

  // 조커 밤 채팅을 쓸 수 있을 때만 받기
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

  // 보내기: 글 다듬기에서 걸리면 보내지 않고 오류만 보여 줌
  const send = () => {
    // 보내는 중·밤 채팅 못 쓸 때·연결·판 없으면 안 보냄
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

    // 화면·세대·소켓·연결·판 중 하나라도 바뀌면 옛 응답
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

    // 응답 결과를 채팅 상태에 반영, 시간 초과면 다시 시도 문구 (옛 응답은 버림)
    emitJokerChat(requestSocket, SEND_TIMEOUT_MS, requestGameId, sanitized.text)
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
      // 마지막 요청일 때만 보내는 중 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          sendingRef.current = false
        }
      })
  }

  // 지금 판 채팅 화면 값 (메시지는 화면용 모양으로 바꿈)
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
