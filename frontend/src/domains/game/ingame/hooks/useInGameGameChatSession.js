// 낮·죽은 사람 채팅 세션 훅: 채널별 받기·보내기와 입력 상태
// 채팅 틀 속성 훅(useInGameChatShellProps)이 사용, 보내기·끊김 받기는 socket/ 함수를 부름
import { useEffect, useReducer, useRef, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { gameChatReducer, initialGameChatState, selectGameChatView } from "../utils/gameChatReducer.js"
import { attachGameChatListener } from "../utils/attachGameChatListener.js"
import { INGAME_CHAT_CHANNELS } from "../utils/inGameChatChannel.js"
import { selectOwnedGameChatContext } from "../utils/selectOwnedGameChatContext.js"
import { sanitizeJokerChatText } from "../utils/sanitizeJokerChatText.js"
import { mapJokerChatSanitizeCodeToMessage } from "../utils/mapJokerChatSanitizeCodeToMessage.js"
import { toJokerChatUiMessage } from "../utils/toJokerChatUiMessage.js"
import { isStaleRoleRevealAckResponse } from "../utils/isStaleRoleRevealAckResponse.js"
import { onDisconnect } from "../socket/connection.js"
import { emitGameChat } from "../socket/chat.js"

const SEND_TIMEOUT_MS = 5000

const RECEIVE_EVENT_BY_CHANNEL = Object.freeze({
  [INGAME_CHAT_CHANNELS.DAY]: "day_chat_message_received",
  [INGAME_CHAT_CHANNELS.DEAD]: "dead_chat_message_received",
})

// 보낸 메시지마다 채널 붙은 순번 (응답이 어느 보내기 것인지 가림)
let requestTokenCounter = 0

function nextRequestToken(channel) {
  requestTokenCounter += 1
  return `${channel}:${requestTokenCounter}`
}

export function useInGameGameChatSession({ getPlayerById } = {}) {
  const [state, dispatch] = useReducer(gameChatReducer, undefined, initialGameChatState)
  const externalGameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const { gameId: ownedGameId, viewChannel, sendChannel } = selectOwnedGameChatContext(
    { gameId: externalGameId, state: gameState },
    authUuid,
  )

  const mountedRef = useRef(true)
  const versionRef = useRef(0)
  const sendingRef = useRef({ [INGAME_CHAT_CHANNELS.DAY]: false, [INGAME_CHAT_CHANNELS.DEAD]: false })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 세대 올려서 보낸 메시지의 응답을 버리고 보내는 중 표시를 지움
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current[INGAME_CHAT_CHANNELS.DAY] = false
    sendingRef.current[INGAME_CHAT_CHANNELS.DEAD] = false
    dispatch({ type: "INVALIDATE" })
  }

  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => invalidate())
    return () => {
      offDisconnect()
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  useEffect(() => {
    invalidate()
    dispatch({ type: "CONTEXT_CHANGED", gameId: ownedGameId, authUuid })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedGameId, authUuid])

  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendChannel, viewChannel])

  useEffect(() => {
    if (!socket) return undefined

    // 받기를 붙인 때의 계정과 지금 계정이 다르면 아무것도 안 받음
    const socketAuthUuid = useAuthStore.getState().user?.uuid ?? null

    const getContext = () => {
      const currentAuthUuid = useAuthStore.getState().user?.uuid ?? null
      if (socketAuthUuid === null || currentAuthUuid !== socketAuthUuid) {
        return { gameId: null, authUuid: null, viewChannel: null }
      }
      const owned = selectOwnedGameChatContext(useInGameStore.getState(), socketAuthUuid)
      return { gameId: owned.gameId, authUuid: socketAuthUuid, viewChannel: owned.viewChannel }
    }
    const handler = (channel, parsed, context) =>
      dispatch({
        type: "RECEIVE",
        gameId: parsed.gameId,
        authUuid: context.authUuid,
        channel,
        message: { id: parsed.id, senderUuid: parsed.senderUuid, text: parsed.text, sentAt: parsed.sentAt },
      })

    const detachers = Object.entries(RECEIVE_EVENT_BY_CHANNEL).map(([channel, eventName]) =>
      attachGameChatListener({ socket, eventName, channel, handler, getContext }),
    )
    return () => {
      for (const detach of detachers) detach()
    }
  }, [socket])

  // 보내기: 글 다듬기에서 걸리면 보내지 않고 그 채널에 오류만 보여 줌
  const send = () => {
    const requestChannel = sendChannel
    if (!requestChannel) return
    if (sendingRef.current[requestChannel]) return

    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) return

    const requestGameId = ownedGameId
    if (!requestGameId) return

    const requestAuthUuid = useAuthStore.getState().user?.uuid ?? null
    if (!requestAuthUuid) return

    const channelView = selectGameChatView(state, requestGameId, requestAuthUuid, requestChannel)
    if (channelView.generation === null) return

    const requestGeneration = channelView.generation
    const requestDraft = channelView.draft

    const sanitized = sanitizeJokerChatText(requestDraft)
    if (!sanitized.ok) {
      dispatch({
        type: "LOCAL_ERROR",
        gameId: requestGameId,
        authUuid: requestAuthUuid,
        channel: requestChannel,
        message: mapJokerChatSanitizeCodeToMessage(sanitized.code),
      })
      return
    }

    const requestToken = nextRequestToken(requestChannel)
    versionRef.current += 1
    const requestVersion = versionRef.current
    sendingRef.current[requestChannel] = true
    dispatch({ type: "SEND", gameId: requestGameId, authUuid: requestAuthUuid, channel: requestChannel, requestToken })

    // 응답 때 판·계정·보내는 채널이 바뀌었으면 옛 응답
    const isStale = () => {
      const currentAuthUuid = useAuthStore.getState().user?.uuid ?? null
      const owned = selectOwnedGameChatContext(useInGameStore.getState(), currentAuthUuid)

      if (
        isStaleRoleRevealAckResponse({
          mounted: mountedRef.current,
          requestVersion,
          currentVersion: versionRef.current,
          requestSocket,
          currentSocket: getSocket(),
          requestGameId,
          currentGameId: owned.gameId,
        })
      ) {
        return true
      }
      if (currentAuthUuid !== requestAuthUuid) return true
      return owned.sendChannel !== requestChannel
    }

    emitGameChat(requestSocket, SEND_TIMEOUT_MS, requestGameId, sanitized.text)
      .then((response) => {
        if (isStale()) return
        dispatch({
          type: "ACK",
          gameId: requestGameId,
          authUuid: requestAuthUuid,
          channel: requestChannel,
          generation: requestGeneration,
          requestToken,
          ok: !!response?.ok,
          message: response?.message ?? "메시지를 보내지 못했습니다.",
          requestDraft,
        })
      })
      .catch(() => {
        if (isStale()) return
        dispatch({
          type: "ACK",
          gameId: requestGameId,
          authUuid: requestAuthUuid,
          channel: requestChannel,
          generation: requestGeneration,
          requestToken,
          ok: false,
          message: "요청이 응답하지 않습니다. 다시 시도해주세요.",
          requestDraft,
        })
      })
      .finally(() => {
        if (requestVersion === versionRef.current) {
          sendingRef.current[requestChannel] = false
        }
      })
  }

  const view = selectGameChatView(state, ownedGameId, authUuid, viewChannel)

  return {
    draft: view.draft,
    setDraft: (draft) =>
      dispatch({ type: "DRAFT", gameId: ownedGameId, authUuid, channel: viewChannel, draft }),
    messages: view.messages.map((m) => toJokerChatUiMessage(m, getPlayerById)).filter(Boolean),
    send,
    status: view.status,
    error: view.error,
  }
}
