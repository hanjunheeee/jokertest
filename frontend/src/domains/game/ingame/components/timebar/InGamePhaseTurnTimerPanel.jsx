// 단계 타이머 묶음: 채팅 틀·시간 바 위 명패+시간패널
// 진행 바(InGameTimebar)·채팅 내용(InGameChatContent)이 사용
import { getEmbeddedChatTimerLayout } from "../../constants/chat/ingameChatTimerLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGameChatEmbeddedPhaseTimer from "./InGameChatEmbeddedPhaseTimer.jsx"

export default function InGamePhaseTurnTimerPanel({
  statusLabel = null,
  remainingRatio = 0,
  remainingSec = null,
  placement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  embeddedLayout = "board",
  showResourcesWithoutLabel = false,
}) {
  const hasLabel = typeof statusLabel === "string" && statusLabel.length > 0
  if (!hasLabel && !showResourcesWithoutLabel) return null

  const layoutKey =
    placement === INGAME_TIMER_PLACEMENT.CHAT
      ? embeddedLayout
      : embeddedLayout === "mobile"
        ? "mobile"
        : "timebar"
  const layout = getEmbeddedChatTimerLayout(layoutKey)

  return (
    <div
      className={layout.wrapClass}
      style={layout.stackInset}
      data-ingame-phase-timer={
        placement === INGAME_TIMER_PLACEMENT.CHAT ? "chat-embedded" : "timebar-embedded"
      }
      data-ingame-phase-timer-layout={layoutKey}
      aria-hidden={false}
    >
      <InGameChatEmbeddedPhaseTimer
        embeddedLayout={layoutKey}
        statusLabel={statusLabel}
        remainingSec={remainingSec}
        showResourcesWithoutLabel={showResourcesWithoutLabel}
      />
    </div>
  )
}