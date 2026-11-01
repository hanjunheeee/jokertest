// 채팅 틀 속성 훅: 밤 채팅 쓸 수 있으면 조커 채팅, 아니면 낮·죽은 사람 채팅 값 고름
// 채팅 세션 Provider(InGameChatSessionProvider)가 사용
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isJokerNightChatEligible } from "../utils/selfAlive.js"
import { useInGameGameChatSession } from "./useInGameGameChatSession.js"
import { useInGameJokerChatSession } from "./useInGameJokerChatSession.js"

// 두 채팅 세션을 늘 붙여 두고 지금 단계에 맞는 쪽 값만 내보냄
export function useInGameChatShellProps() {
  const { getPlayerById } = useInGamePlayerSessionContext()
  const gameState = useInGameStore((s) => s.state)
  const isRoleNight = isJokerNightChatEligible(gameState)

  const gameChatSession = useInGameGameChatSession({ getPlayerById })
  const jokerChatSession = useInGameJokerChatSession({ getPlayerById })
  const chatSession = isRoleNight ? jokerChatSession : gameChatSession

  return {
    draft: chatSession.draft,
    messages: chatSession.messages,
    onDraftChange: chatSession.setDraft,
    onSend: chatSession.send,
    status: chatSession.status ?? null,
    error: chatSession.error ?? null,
    // 입력 중엔 글자 수로 안 자름 (길이는 보낼 때 글 다듬기에서 걸림)
    truncateDraftOnInput: false,
  }
}
