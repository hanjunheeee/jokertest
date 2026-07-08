import { useCallback, useState } from "react"
import { INGAME_CHAT_INPUT_MAX_LENGTH } from "../constants/chat/ingameChatAssets.js"

/**
 * 인게임 채팅 — draft·messages (보드·클로즈업 공유).
 * @param {{ localPlayerId?: string, getPlayerById?: (id: string) => { nickname?: string } | null }} [options]
 */
export function useInGameChatSession({
  localPlayerId = null,
  getPlayerById = null,
} = {}) {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState([])

  const send = useCallback(() => {
    const text = draft.trim().slice(0, INGAME_CHAT_INPUT_MAX_LENGTH)
    if (!text) return

    const sender = localPlayerId ? getPlayerById?.(localPlayerId) : null

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        playerId: localPlayerId,
        senderName: sender?.nickname ?? "You",
        text,
      },
    ])
    setDraft("")
  }, [draft, getPlayerById, localPlayerId])

  return {
    draft,
    setDraft,
    messages,
    send,
  }
}
