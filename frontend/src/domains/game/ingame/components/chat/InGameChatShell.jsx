import { useState } from "react"
import {
  PANEL_POSITION_CLASS,
  getPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { useInGameChatSessionContext } from "./InGameChatSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import InGameChatCloseupOverlay from "./closeup/InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"

function selectTribunalPresentationOpen(state) {
  return state?.phase === "TRIBUNAL"
    && Boolean(state?.tribunal?.defendantUuid)
    && state.tribunal.resolved !== true
}

export default function InGameChatShell() {
  const [closeupOpen, setCloseupOpen] = useState(false)
  const tribunalPresentationOpen = useInGameStore((s) => selectTribunalPresentationOpen(s.state))
  const chatProps = useInGameChatSessionContext()

  if (tribunalPresentationOpen) return null

  return (
    <>
      <aside
        aria-label="채팅"
        className={PANEL_POSITION_CLASS}
        style={getPanelStyle()}
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
