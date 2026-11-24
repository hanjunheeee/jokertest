// 채팅 세션 Provider: 낮·죽은 사람 채팅과 밤 직업 채팅을 묶어 화면에 나눠 줌
// 인게임 화면(데스크톱·모바일)이 감쌈, 꺼내기는 InGameChatSessionContext의 훅으로
// 밤에 살아 있으면 보내기는 직업 채널, 목록은 낮 채팅 + 직업 채팅을 시간 순으로 섞음
// 죽은 광대는 직업 채팅 읽기만 → 죽은 사람 채팅 목록에 시각 순으로 섞음
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { INGAME_CHAT_CHANNELS } from "../../utils/inGameChatChannel.js"
import { mergeChatMessagesByTime } from "../../utils/mergeChatMessages.js"
import { isJokerNightChatEligible } from "../../utils/selfAlive.js"
import { useInGameGameChatSession } from "../../hooks/useInGameGameChatSession.js"
import { useInGameJokerChatSession } from "../../hooks/useInGameJokerChatSession.js"
import { InGameChatSessionContext } from "./InGameChatSessionContext.js"

// 두 채팅 세션을 늘 붙여 두고 지금 단계에 맞는 쪽 값만 내보냄
function useChatSessionValue() {
  const { getPlayerById } = useInGamePlayerSessionContext()
  const gameState = useInGameStore((s) => s.state)
  const isRoleNight = isJokerNightChatEligible(gameState)

  const gameChatSession = useInGameGameChatSession({ getPlayerById })
  const jokerChatSession = useInGameJokerChatSession({ getPlayerById })
  const composeSession = isRoleNight ? jokerChatSession : gameChatSession
  const isDeadChat = !isRoleNight && gameChatSession.isDeadChat === true

  const roleNightUiMessages = isRoleNight
    ? jokerChatSession.messages
    : isDeadChat && gameState?.self?.role === INGAME_CHAT_CHANNELS.JOKER
      ? jokerChatSession.messages.map((m) => ({ ...m, channel: INGAME_CHAT_CHANNELS.JOKER }))
      : []

  let messages = gameChatSession.messages
  if (isRoleNight) {
    messages = mergeChatMessagesByTime(gameChatSession.dayChannelMessages, roleNightUiMessages)
  } else if (roleNightUiMessages.length > 0) {
    messages = mergeChatMessagesByTime(messages, roleNightUiMessages)
  }

  return {
    draft: composeSession.draft,
    messages,
    // 죽은 사람끼리 채팅 중인지 (채팅 칸 위 표시용)
    isDeadChat,
    onDraftChange: composeSession.setDraft,
    onSend: composeSession.send,
    status: composeSession.status ?? null,
    error: composeSession.error ?? null,
    // 입력 중엔 글자 수로 안 자름 (길이는 보낼 때 글 다듬기에서 걸림)
    truncateDraftOnInput: false,
  }
}

// 채팅 틀과 재판 연출 채팅이 같은 세션을 보게 한 번만 만듦
export function InGameChatSessionProvider({ children }) {
  const chatSession = useChatSessionValue()

  return (
    <InGameChatSessionContext.Provider value={chatSession}>
      {children}
    </InGameChatSessionContext.Provider>
  )
}
