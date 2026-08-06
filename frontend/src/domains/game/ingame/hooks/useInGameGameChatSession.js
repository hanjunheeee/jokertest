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

const SEND_TIMEOUT_MS = 5000

/** 채널 → 서버 수신 이벤트명. 클라이언트가 채널을 고르는 입력이 아니라 고정 매핑이다. */
const RECEIVE_EVENT_BY_CHANNEL = Object.freeze({
  [INGAME_CHAT_CHANNELS.DAY]: "day_chat_message_received",
  [INGAME_CHAT_CHANNELS.DEAD]: "dead_chat_message_received",
})

// 모듈 전역 단조 증가 카운터 — 같은 페이지 안에서 두 훅 인스턴스가 동시에 살아있어도 토큰이
// 절대 겹치지 않게 한다(Math.random/crypto에 의존하지 않아 테스트에서도 결정적이다).
let requestTokenCounter = 0

function nextRequestToken(channel) {
  requestTokenCounter += 1
  return `${channel}:${requestTokenCounter}`
}

/**
 * 공개 DAY 채팅과 사망자 전용 채팅을 함께 다루는 실시간 세션(useInGameJokerChatSession과
 * 동일한 늦은 응답 방어 패턴). 두 채널의 messages/draft/status/error/세대/진행 중 요청은
 * gameChatReducer가 완전히 분리해 소유하고, 화면에 보이는 채널은 canonical self.alive에서
 * 유도한다.
 *
 * 채팅 상태의 소유자는 (gameId, 인증 계정 uuid) 쌍이다 — 둘 중 하나라도 바뀌면(게임 전환·
 * 계정 전환·로그아웃·계정 무효화) 진행 중이던 요청을 무효화하고 두 채널을 통째로 새로
 * 시작한다. 그래서 같은 기기에서 계정만 갈아끼워도 이전 계정의 메시지·초안·오류가 새 계정
 * 화면에 남지 않는다(reducer·셀렉터·수신 리스너가 각각 독립적으로 같은 규칙을 강제한다).
 *
 * 그 gameId·채널 자체도 인증 계정이 소유한 상태에서만 유도한다(selectOwnedGameChatContext) —
 * 계정만 바뀌고 인게임 store에는 아직 이전 계정의 게임 상태가 남아 있는 순간에, 새 계정이
 * 이전 게임에 묶인 채팅 화면을 얻지 않도록 fail-closed로 막는다.
 *
 * 제출은 언제나 submit_game_chat_message({ gameId, text })뿐이다 — 채널·발신자·닉네임·수신자는
 * 서버가 인증 uuid와 canonical phase/생존 상태에서 유도하므로 payload에 싣지 않는다.
 * 여기서 계산하는 sendChannel은 UI 게이팅(보낼 수 없는 phase에서 emit 자체를 하지 않음)에만
 * 쓰이고 권한의 원천이 아니다.
 *
 * 늦은 응답 방어: 제출 시점에 gameId·인증 계정 uuid·유효 전송 채널·그 채널의 세대·고유 요청
 * 토큰·socket 참조를 전부 캡처하고, 응답(또는 타임아웃)이 도착했을 때 그 값들이 지금도 전부
 * 그대로일 때만 반영한다. 하나라도 어긋나면 그 응답은 아무 것도 바꾸지 않는다.
 */
export function useInGameGameChatSession({ getPlayerById } = {}) {
  const [state, dispatch] = useReducer(gameChatReducer, undefined, initialGameChatState)
  const externalGameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // gameId·두 채널은 "인증 계정이 소유한 게임 상태"에서만 나온다 — self.uuid가 인증 uuid와
  // 다르면(계정 전환 직후 남아 있는 이전 계정의 상태) 전부 null이라 전송도 수신도 하지 않는다.
  const { gameId: ownedGameId, viewChannel, sendChannel } = selectOwnedGameChatContext(
    { gameId: externalGameId, state: gameState },
    authUuid,
  )

  const mountedRef = useRef(true)
  const versionRef = useRef(0)
  // 채널별 전송 잠금 — React state 반영을 기다리지 않고 같은 tick의 연타를 즉시 막는다.
  const sendingRef = useRef({ [INGAME_CHAT_CHANNELS.DAY]: false, [INGAME_CHAT_CHANNELS.DEAD]: false })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중이던 전송 요청을 무효화하고 잠금을 즉시 해제한다 — disconnect·socket 교체·unmount·
  // gameId 변경·인증 계정 변경·유효 채널(생존/phase 자격) 변경이 전부 이 함수 하나만 거친다.
  // reducer의 세대까지 함께 올리므로, 이 시점 이후에 도착하는 어떤 응답도 반영되지 않는다.
  const invalidate = () => {
    versionRef.current += 1
    sendingRef.current[INGAME_CHAT_CHANNELS.DAY] = false
    sendingRef.current[INGAME_CHAT_CHANNELS.DEAD] = false
    dispatch({ type: "INVALIDATE" })
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

  // 상태의 소유자(gameId + 인증 계정)가 바뀌면 진행 중이던 요청을 무효화하고 두 채널을 통째로
  // 새로 시작한다 — 게임 전환뿐 아니라 계정 전환·로그아웃·계정 무효화(authUuid가 null이 되는
  // 경우)까지 같은 한 경로를 지나므로, 이전 소유자의 메시지·초안·오류·요청 토큰이 남지 않는다.
  useEffect(() => {
    invalidate()
    dispatch({ type: "CONTEXT_CHANGED", gameId: ownedGameId, authUuid })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedGameId, authUuid])

  // 생존/phase 자격이 바뀌어 유효 채널이 달라지면(DAY→null, DAY→DEAD, ENDED로 인한 null 등)
  // 진행 중이던 요청을 전부 무효화한다. viewChannel도 함께 보는 이유는 "보낼 수는 없지만
  // 보이는 채널"만 바뀌는 전이에서도 이전 채널의 전송 표시·오류가 남지 않게 하기 위함이다.
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendChannel, viewChannel])

  // 두 채널의 수신 리스너는 socket 하나당 한 번만 등록하고, socket 참조가 바뀌면 이전 socket의
  // 리스너를 정확히 그 참조로 해제한다(누적 등록으로 인한 중복 반영 방지). gameId·보기 채널은
  // deps에 넣지 않고 getContext가 호출 시점의 store에서 다시 읽는다 — 리스너 등록 당시의 값을
  // 클로저로 굳혀두면 그 사이의 사망·게임 전환을 반영하지 못한다.
  //
  // 반면 인증 계정만은 등록 시점의 값(socketAuthUuid)에 묶는다. socket 연결은 서버에서 그때의
  // 계정으로 인증돼 있으므로, 이 socket으로 오는 메시지는 언제나 그 계정의 것이다. 그래서
  // 계정이 바뀐 뒤(같은 socket이 아직 살아있는 창) 도착한 메시지는 새 계정의 것으로 둔갑시키지
  // 않고 전부 버린다 — 새 계정의 메시지는 useSocket이 새로 만든 socket에서만 받는다.
  useEffect(() => {
    if (!socket) return undefined

    const socketAuthUuid = useAuthStore.getState().user?.uuid ?? null

    const getContext = () => {
      const currentAuthUuid = useAuthStore.getState().user?.uuid ?? null
      // 이 socket을 인증했던 계정이 없거나, 그 사이 계정이 바뀌었다면 어떤 메시지도 받지 않는다.
      if (socketAuthUuid === null || currentAuthUuid !== socketAuthUuid) {
        return { gameId: null, authUuid: null, viewChannel: null }
      }
      const owned = selectOwnedGameChatContext(useInGameStore.getState(), socketAuthUuid)
      return { gameId: owned.gameId, authUuid: socketAuthUuid, viewChannel: owned.viewChannel }
    }
    // 반영 시점의 신원(gameId + 인증 계정)을 그대로 실어 보낸다 — reducer가 지금 상태가 소유한
    // 신원과 대조해, 계정이 바뀐 직후 도착한 메시지가 이전/새 소유자 어느 쪽 상태에도 섞이지
    // 않게 한다.
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

  const send = () => {
    // 지금 보낼 수 있는 채널이 없으면(생존자의 NIGHT/TRIBUNAL, 사망자의 ROLE_REVEAL/ENDED,
    // 생존 여부 미확정 등) emit 자체를 하지 않는다 — 서버도 같은 규칙으로 INVALID_PHASE를
    // 반환한다. 채널은 사용자가 고르는 값이 아니라 canonical 상태에서만 유도된다.
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
    // 마스킹된 상태(아직 이 신원의 채팅 상태가 아님)에서는 세대를 캡처할 수 없으므로 보내지 않는다.
    if (channelView.generation === null) return

    const requestGeneration = channelView.generation
    const requestDraft = channelView.draft

    const sanitized = sanitizeJokerChatText(requestDraft)
    if (!sanitized.ok) {
      // 공백만 입력 등 서버까지 갈 필요 없는 입력은 emit하지 않고 그 채널에만 안내를 남긴다(초안 보존).
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

    const isStale = () => {
      // 지금 이 순간에도 gameId·채널은 "인증 계정이 소유한 상태"에서만 유도한다 — 응답을
      // 기다리는 사이 계정이 바뀌었다면 소유권이 끊겨 gameId/채널이 null이 되고, 그 응답은
      // 아래 두 비교에서 모두 stale로 걸린다.
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
      // 응답을 기다리는 사이 인증 계정이 바뀌었다면(로그아웃·계정 전환) 이전 계정의 응답이다.
      if (currentAuthUuid !== requestAuthUuid) return true
      // 요청을 보낸 뒤 phase가 넘어갔거나 사망이 확정돼 유효 채널이 바뀌었다면, 그 응답은 더 이상
      // 이 화면의 상태가 아니다 — 사망자 화면에 공개 채팅 오류/성공이 새어 나오지 않게 한다.
      return owned.sendChannel !== requestChannel
    }

    requestSocket
      .timeout(SEND_TIMEOUT_MS)
      .emitWithAck("submit_game_chat_message", { gameId: requestGameId, text: sanitized.text })
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
