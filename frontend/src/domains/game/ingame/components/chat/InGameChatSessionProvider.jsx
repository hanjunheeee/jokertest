// 채팅 세션 Provider: 낮·죽은 사람 채팅과 조커 밤 채팅 중 지금 쓸 값을 골라 아래에 나눠 줌
// 인게임 화면(데스크톱·모바일)이 감쌈, 꺼내기는 InGameChatSessionContext의 훅으로
// 죽은 광대는 같은 직업 채팅을 읽기만 → 죽은 사람 채팅 목록에 시각 순으로 섞음
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
  const chatSession = isRoleNight ? jokerChatSession : gameChatSession
  const isDeadChat = !isRoleNight && gameChatSession.isDeadChat === true
  const roleMessages = isDeadChat && gameState?.self?.role === INGAME_CHAT_CHANNELS.JOKER
    ? jokerChatSession.messages.map((m) => ({ ...m, channel: INGAME_CHAT_CHANNELS.JOKER }))
    : []

  return {
    draft: chatSession.draft,
    messages: roleMessages.length > 0 ? mergeChatMessagesByTime(chatSession.messages, roleMessages) : chatSession.messages,
    // 죽은 사람끼리 채팅 중인지 (채팅 칸 위 표시용)
    isDeadChat,
    onDraftChange: chatSession.setDraft,
    onSend: chatSession.send,
    status: chatSession.status ?? null,
    error: chatSession.error ?? null,
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
