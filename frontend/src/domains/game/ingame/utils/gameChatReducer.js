import { INGAME_CHAT_CHANNELS } from "./inGameChatChannel.js"

/**
 * 공개 DAY 채팅과 사망자 전용 채팅은 어떤 상태도 공유하지 않는다(채널 격리). messages/draft뿐
 * 아니라 status/error/세대(generation)/진행 중 요청 토큰(pendingToken)까지 채널별로 따로 소유해야,
 * 한 채널의 전송 결과가 다른 채널의 화면(전송 중 표시·오류 문구·초안)에 새어 나오지 않는다.
 *
 *   - generation: "지금 이 채널의 유효한 요청 세대". 무효화(INVALIDATE)마다 1씩 증가한다.
 *     제출 시점에 캡처한 세대와 응답 시점의 세대가 다르면 그 응답은 반영되지 않는다.
 *   - pendingToken: 이 채널에서 응답을 기다리고 있는 요청의 고유 토큰. 매 제출마다 새 값이라
 *     같은 채널의 더 오래된 응답이 더 새로운 요청/초안을 덮어쓰거나 지우지 못한다.
 */
function emptyChannelState() {
  return { messages: [], draft: "", status: "idle", error: null, generation: 0, pendingToken: null }
}

/**
 * 채팅 상태의 신원(identity)은 gameId 하나가 아니라 (gameId, 인증 계정 uuid) 쌍이다 — 같은 기기
 * 에서 계정만 바뀌어도(로그아웃·계정 전환·계정 무효화) 그 상태는 더 이상 지금 사용자의 것이
 * 아니기 때문이다. gameId가 그대로여도 계정이 달라지면 이전 계정의 메시지·초안·오류가 새 계정
 * 화면에 남아서는 안 된다.
 *
 * 그래서 이 reducer는 세 지점 전부에서 신원을 강제한다:
 *   1. 신원이 달라지면(CONTEXT_CHANGED) 두 채널을 통째로 새로 시작한다 — 메시지·초안·상태·
 *      오류가 모두 비워지고 진행 중이던 요청 토큰도 해제된다.
 *   2. 신원이 다른 액션(늦게 도착한 이전 계정의 ACK, 이전 게임의 수신 메시지)은 전부 무시된다.
 *   3. 셀렉터도 신원이 어긋나면 아무 것도 노출하지 않는다(selectGameChatView).
 *
 * 인증 계정이 없는 상태(로그아웃·미확정)에서는 어떤 채팅 상태도 소유하지 않는다 — gameId까지
 * 함께 비워, 계정이 없는 동안에는 어떤 액션도 상태에 닿지 못한다(fail-closed).
 */
export function initialGameChatState() {
  return {
    gameId: null,
    authUuid: null,
    [INGAME_CHAT_CHANNELS.DAY]: emptyChannelState(),
    [INGAME_CHAT_CHANNELS.DEAD]: emptyChannelState(),
  }
}

function isKnownChannel(channel) {
  return channel === INGAME_CHAT_CHANNELS.DAY || channel === INGAME_CHAT_CHANNELS.DEAD
}

/** 인증 계정이 없는 상태(로그아웃·미확정)에서는 어떤 채팅 상태도 소유하지 않는다(fail-closed). */
function isAuthenticated(authUuid) {
  return typeof authUuid === "string" && authUuid.length > 0
}

/** 상태가 실제로 소유할 수 있는 신원으로 정규화한다 — 계정이 없으면 gameId도 소유하지 않는다. */
function normalizeIdentity(gameId, authUuid) {
  if (!isAuthenticated(authUuid)) return { gameId: null, authUuid: null }
  return { gameId: typeof gameId === "string" && gameId.length > 0 ? gameId : null, authUuid }
}

/** 액션이 지금 상태가 소유한 신원(gameId + 인증 계정)에서 온 것인지 — 하나라도 다르면 무시한다. */
function isCurrentIdentity(state, action) {
  return (
    isAuthenticated(state.authUuid) &&
    state.gameId !== null &&
    action.gameId === state.gameId &&
    action.authUuid === state.authUuid
  )
}

/**
 * 신원이 바뀌면 두 채널을 모두 새로 시작한다(같은 신원이면 참조 그대로 반환). 계정 전환·
 * 로그아웃·계정 무효화·gameId 전환이 전부 이 한 경로를 지나므로, "이전 소유자의 상태가
 * 남는" 경우가 구조적으로 존재하지 않는다.
 */
function withIdentitySync(state, gameId, authUuid) {
  const identity = normalizeIdentity(gameId, authUuid)
  if (identity.gameId === state.gameId && identity.authUuid === state.authUuid) return state
  return { ...initialGameChatState(), ...identity }
}

/** 진행 중이던 요청을 버리고(세대 증가·토큰 해제) 전송 표시·오류만 초기화한다. 초안·메시지는 보존한다. */
function invalidateChannel(channelState) {
  return {
    ...channelState,
    status: "idle",
    error: null,
    generation: channelState.generation + 1,
    pendingToken: null,
  }
}

/**
 * 공개 DAY 채팅 + 사망자 전용 채팅의 신원(gameId + 인증 계정) 전환 원자성과 채널 격리를 소유하는
 * reducer다. 모든 액션이 action.gameId와 action.authUuid를 함께 받아 현재 신원과 하나라도 다르면
 * 무시된다(CONTEXT_CHANGED만 예외 — 신원 자체를 바꾸는 액션이고, INVALIDATE만 예외 — 신원과
 * 무관하게 항상 적용돼야 하는 fail-closed 동작이다).
 *
 * 한 채널의 액션은 절대 다른 채널의 상태를 건드리지 않는다 — 사망 전에 쓰던 공개 채팅 초안이
 * 사망자 채팅 전송으로 지워지거나, 한쪽 채널의 오류 문구가 다른 쪽 화면에 뜨지 않는다.
 */
export function gameChatReducer(state, action) {
  switch (action.type) {
    case "CONTEXT_CHANGED":
      return withIdentitySync(state, action.gameId, action.authUuid)

    // 수신 메시지는 신원을 만들지 않는다 — 지금 소유한 신원과 정확히 일치할 때만 append한다.
    // (이전 계정/이전 게임의 늦은 메시지가 새 소유자의 화면에 섞이지 않는다.)
    case "RECEIVE": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      const channelState = state[action.channel]
      return {
        ...state,
        [action.channel]: { ...channelState, messages: [...channelState.messages, action.message] },
      }
    }

    case "DRAFT": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      return { ...state, [action.channel]: { ...state[action.channel], draft: action.draft } }
    }

    case "SEND": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      if (typeof action.requestToken !== "string" || action.requestToken.length === 0) return state
      return {
        ...state,
        [action.channel]: { ...state[action.channel], status: "sending", error: null, pendingToken: action.requestToken },
      }
    }

    // 서버까지 갈 필요 없는 입력(공백만·금지 문자 등)을 emit 없이 안내만 하는 경로.
    // 진행 중인 요청이 없는 상태에서만 일어나므로 세대·토큰을 건드리지 않고 초안도 보존한다.
    case "LOCAL_ERROR": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      return { ...state, [action.channel]: { ...state[action.channel], status: "idle", error: action.message } }
    }

    case "ACK": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state

      // 제출 시점에 캡처한 세대·토큰이 지금도 그대로일 때만 반영한다 — 무효화된 뒤 도착한
      // 응답, 그리고 같은 채널의 더 오래된 응답은 여기서 전부 무시된다(fail-closed).
      const channelState = state[action.channel]
      if (channelState.generation !== action.generation) return state
      if (channelState.pendingToken === null || channelState.pendingToken !== action.requestToken) return state

      if (!action.ok) {
        // 실패는 초안을 보존한다 — 사용자가 다시 보낼 수 있어야 한다.
        return {
          ...state,
          [action.channel]: { ...channelState, status: "idle", error: action.message, pendingToken: null },
        }
      }

      // 성공한 요청이 보냈던 그 초안이 아직 그대로 남아있을 때만 비운다 — 응답을 기다리는
      // 동안 사용자가 다음 문장을 입력했다면 그 입력을 지우지 않는다.
      const draft = channelState.draft === action.requestDraft ? "" : channelState.draft
      return {
        ...state,
        [action.channel]: { ...channelState, status: "idle", error: null, pendingToken: null, draft },
      }
    }

    // 무효화는 언제나 성립해야 하는 fail-closed 동작이라 신원 일치를 요구하지 않는다 —
    // 두 채널의 세대를 함께 올려, 무효화 이전에 나간 어떤 채널의 응답도 반영되지 않게 한다.
    case "INVALIDATE":
      return {
        ...state,
        [INGAME_CHAT_CHANNELS.DAY]: invalidateChannel(state[INGAME_CHAT_CHANNELS.DAY]),
        [INGAME_CHAT_CHANNELS.DEAD]: invalidateChannel(state[INGAME_CHAT_CHANNELS.DEAD]),
      }

    default:
      return state
  }
}

const MASKED_VIEW = Object.freeze({ draft: "", messages: [], status: "idle", error: null, generation: null })

/**
 * 렌더링·제출 시점 마스킹(selectJokerChatView와 동일한 이유). 다음 중 하나라도 어긋나면 그
 * 채널의 초안·메시지·전송 상태·오류를 하나도 노출하지 않는다:
 *
 *   - state가 소유한 gameId가 지금 유효한 gameId와 다르다
 *   - state가 소유한 인증 계정이 지금 로그인된 계정과 다르다(계정 전환·계정 무효화 직후,
 *     gameId와 채널이 그대로여도 이전 계정의 상태는 절대 보이지 않는다)
 *   - 지금 로그인된 계정 자체가 없다(로그아웃·미확정 — fail-closed)
 *   - 요청한 채널이 지금 접근할 수 있는 채널이 아니다(생존 여부 미확정이라 null이거나
 *     사망자가 공개 DAY를 들여다보려는 경우)
 *
 * 접근 가능한 채널은 호출부가 canonical 상태에서 유도해(resolveInGameChatViewChannel/
 * resolveInGameChatSendChannel) 넘긴다.
 *
 * generation은 마스킹된 경우 null이다 — 제출 경로가 "아직 이 신원의 채팅 상태가 아니다"를
 * 세대 값으로 구분해 emit 자체를 하지 않게 하기 위함이다.
 */
export function selectGameChatView(state, currentGameId, currentAuthUuid, accessibleChannel) {
  if (!isAuthenticated(currentAuthUuid)) return MASKED_VIEW
  if (state.authUuid !== currentAuthUuid) return MASKED_VIEW
  if (state.gameId === null || state.gameId !== currentGameId) return MASKED_VIEW
  if (!isKnownChannel(accessibleChannel)) return MASKED_VIEW

  const channelState = state[accessibleChannel]
  return {
    draft: channelState.draft,
    messages: channelState.messages,
    status: channelState.status,
    error: channelState.error,
    generation: channelState.generation,
  }
}
