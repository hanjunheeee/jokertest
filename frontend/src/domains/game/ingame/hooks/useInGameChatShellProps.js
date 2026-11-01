import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { useInGameStore } from "../store/ingameStore.js"
import { isJokerNightChatEligible } from "../utils/selfAlive.js"
import { useInGameGameChatSession } from "./useInGameGameChatSession.js"
import { useInGameJokerChatSession } from "./useInGameJokerChatSession.js"

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
    truncateDraftOnInput: false,
  }
}
