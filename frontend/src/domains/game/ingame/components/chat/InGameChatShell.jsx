import { useState } from "react"
import {
  INGAME_CHAT_PANEL_POSITION_CLASS,
  getInGameChatPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { useInGameChatSession } from "../../hooks/useInGameChatSession.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionProvider.jsx"
import InGameChatCloseupOverlay from "./closeup/InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"

/**
 * 인게임 채팅 — 탁자 중앙 상시 표시 + 클로즈업 오버레이
 */
export default function InGameChatShell() {
  const [closeupOpen, setCloseupOpen] = useState(false)
  const { localPlayerId, getPlayerById } = useInGamePlayerSessionContext()
  const { draft, setDraft, messages, send } = useInGameChatSession({
    localPlayerId,
    getPlayerById,
  })

  const chatProps = {
    draft,
    messages,
    onDraftChange: setDraft,
    onSend: send,
  }

  return (
    <>
      <aside
        aria-label="채팅"
        className={INGAME_CHAT_PANEL_POSITION_CLASS}
        style={getInGameChatPanelStyle()}
      >
        <InGameChatContent
          variant="board"
          {...chatProps}
          onOpenCloseup={() => setCloseupOpen(true)}
        />
      </aside>

      <InGameChatCloseupOverlay
        open={closeupOpen}
        onClose={() => setCloseupOpen(false)}
        {...chatProps}
      />
    </>
  )
}
