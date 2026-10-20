import { useState } from "react"
import {
  INGAME_CHAT_PANEL_POSITION_CLASS,
  getInGameChatPanelStyle,
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

/**
 * 인게임 채팅 — 탁자 중앙 상시 표시 + 클로즈업 오버레이
 *
 * TRIBUNAL 연출 구간에는 보드 채팅을 숨기고, 연출 오버레이 우측 패널이 채팅을 담당한다.
 */
export default function InGameChatShell() {
  const [closeupOpen, setCloseupOpen] = useState(false)
  const tribunalPresentationOpen = useInGameStore((s) => selectTribunalPresentationOpen(s.state))
  const chatProps = useInGameChatSessionContext()

  if (tribunalPresentationOpen) return null

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
