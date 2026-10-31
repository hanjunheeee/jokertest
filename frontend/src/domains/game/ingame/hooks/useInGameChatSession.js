import { useCallback, useMemo, useState } from "react"
import { INGAME_CHAT_INPUT_MAX_LENGTH } from "../constants/chat/ingameChatAssets.js"

export function useInGameChatSession({
  localPlayerId = null,
  getPlayerById = null,
  serverEvents = null,
  onSendText = null,
} = {}) {
  const [draft, setDraft] = useState("")

  const [localMessages, setLocalMessages] = useState([])

  const serverMessages = useMemo(() => {
    if (!serverEvents) return null

    return serverEvents
      .filter((event) => event.type === "CHAT_SENT")
      .map((event) => {
        const sender = event.actorId ? getPlayerById?.(event.actorId) : null

        return {
          id: event.id,
          playerId: event.actorId,
          senderName: sender?.nickname ?? "Player",
          text: event.message ?? "",
        }
      })
  }, [getPlayerById, serverEvents])

  const send = useCallback(() => {
    const text = draft.trim().slice(0, INGAME_CHAT_INPUT_MAX_LENGTH)
    if (!text) return

    if (onSendText) {
      onSendText(text)
      setDraft("")
      return
    }

    const sender = localPlayerId ? getPlayerById?.(localPlayerId) : null

    setLocalMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        playerId: localPlayerId,
        senderName: sender?.nickname ?? "You",
        text,
      },
    ])
    setDraft("")
  }, [draft, getPlayerById, localPlayerId, onSendText])

  return {
    draft,
    setDraft,
    messages: serverMessages ?? localMessages,
    send,
  }
}
