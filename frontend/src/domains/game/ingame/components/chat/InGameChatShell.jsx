// 채팅 틀: 보드 구석 채팅(타이머 자리가 채팅이면 틀 안 타이머)과 크게 보기 창, 재판 연출 중엔 숨김
// 인게임 화면이 사용, 채팅 값은 채팅 세션 컨텍스트에서 꺼냄
import { useState } from "react"
import {
  PANEL_POSITION_CLASS,
  getPanelStyle,
} from "../../constants/chat/ingameChatBoardLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import { useInGameChatSessionContext } from "./InGameChatSessionContext.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { selectInGameEntryPreparingActive } from "../../utils/selectInGameEntryPreparing.js"
import InGameChatCloseupOverlay from "./InGameChatCloseupOverlay.jsx"
import InGameChatContent from "./InGameChatContent.jsx"

// 재판 연출이 떠 있는지 (재판 중·피고 있음·판정 전), 인게임 화면·문지기와 같은 조건
function selectTribunalPresentationOpen(state) {
  return state?.phase === "TRIBUNAL"
    && Boolean(state?.tribunal?.defendantUuid)
    && state.tribunal.resolved !== true
}

// 크게 보기 열림은 여기서만 들고 있음, 타이머 값은 인게임 화면이 넘김
// coverOverlayOpen: 전면 잠금·단계 안내(죽은 사람 안내 포함)·밤 차례 창이 떠 있음
export default function InGameChatShell({
  timerPlacement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  statusLabel = null,
  remainingRatio = 0,
  remainingSec = null,
  coverOverlayOpen = false,
}) {
  const [closeupOpen, setCloseupOpen] = useState(false)
  const tribunalPresentationOpen = useInGameStore((s) => selectTribunalPresentationOpen(s.state))
  const entryPreparingActive = useInGameStore((s) => selectInGameEntryPreparingActive(s.state))
  const chatProps = useInGameChatSessionContext()
  const hasStatusLabel = typeof statusLabel === "string" && statusLabel.length > 0

  // 재판·아침 연출·밤 결과·사망 선택·단계 안내·밤 차례 창이 뜨면 크게 보기 닫기 (창 가림·닫기 먹통 막기)
  if ((tribunalPresentationOpen || coverOverlayOpen) && closeupOpen) setCloseupOpen(false)

  // 재판 연출이 자기 채팅을 띄우므로 겹치지 않게 숨김
  if (tribunalPresentationOpen) return null

  // 틀 안 타이머: 채팅 자리 + (단계 글 또는 입장 준비 중 빈 명패)
  const showEmbeddedPhaseTimer =
    timerPlacement === INGAME_TIMER_PLACEMENT.CHAT
    && (hasStatusLabel || entryPreparingActive)
  const embeddedPhaseTimerShowResourcesWithoutLabel = entryPreparingActive && !hasStatusLabel

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
          showEmbeddedPhaseTimer={showEmbeddedPhaseTimer}
          embeddedPhaseTimerStatusLabel={statusLabel}
          embeddedPhaseTimerRemainingRatio={remainingRatio}
          embeddedPhaseTimerRemainingSec={remainingSec}
          embeddedPhaseTimerShowResourcesWithoutLabel={embeddedPhaseTimerShowResourcesWithoutLabel}
        />
      </aside>

      <InGameChatCloseupOverlay
        open={closeupOpen}
        onClose={() => setCloseupOpen(false)}
        {...chatProps}
        showEmbeddedPhaseTimer={showEmbeddedPhaseTimer}
        embeddedPhaseTimerStatusLabel={statusLabel}
        embeddedPhaseTimerRemainingRatio={remainingRatio}
        embeddedPhaseTimerRemainingSec={remainingSec}
        embeddedPhaseTimerShowResourcesWithoutLabel={embeddedPhaseTimerShowResourcesWithoutLabel}
      />
    </>
  )
}
