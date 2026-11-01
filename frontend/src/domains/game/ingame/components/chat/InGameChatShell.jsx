// 채팅 틀: 보드 구석 채팅과 크게 보기 창, 재판 연출 중엔 숨김
// 인게임 화면·InGamePlayArea가 사용, 채팅 값은 채팅 세션 컨텍스트에서 꺼냄
import { useState } from "react"
import {
  PANEL_POSITION_CLASS,
  getPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { useInGameChatSessionContext } from "./InGameChatSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import InGameChatCloseupOverlay from "./InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"

// 재판 연출이 떠 있는지 (재판 중·피고 있음·판정 전), 인게임 화면·문지기와 같은 조건
function selectTribunalPresentationOpen(state) {
  return state?.phase === "TRIBUNAL"
    && Boolean(state?.tribunal?.defendantUuid)
    && state.tribunal.resolved !== true
}

// 크게 보기 열림은 여기서만 들고 있음
export default function InGameChatShell() {
  const [closeupOpen, setCloseupOpen] = useState(false)
  const tribunalPresentationOpen = useInGameStore((s) => selectTribunalPresentationOpen(s.state))
  const chatProps = useInGameChatSessionContext()

  // 재판 연출이 자기 채팅을 띄우므로 겹치지 않게 숨김
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
