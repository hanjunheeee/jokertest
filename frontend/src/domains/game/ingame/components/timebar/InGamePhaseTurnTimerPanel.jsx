import {
  INGAME_CHAT_EMBEDDED_TIMER_INSET,
  INGAME_CHAT_EMBEDDED_TIMER_WRAP_CLASS,
} from "../../constants/chat/ingameChatTimerLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGameTimebarExpandedTimer from "./InGameTimebarExpandedTimer.jsx"
import InGameTimebarPhaseHeader from "./InGameTimebarPhaseHeader.jsx"

/**
 * phase 문구 + MM:SS 타이머바 — chat 배치용(채팅 패널 위) 또는 timebar 확대 내부.
 */
export default function InGamePhaseTurnTimerPanel({
  statusLabel = null,
  remainingRatio = 0,
  remainingSec = null,
  placement = INGAME_TIMER_PLACEMENT.TIMEBAR,
}) {
  if (placement === INGAME_TIMER_PLACEMENT.CHAT) {
    return (
      <div
        className={INGAME_CHAT_EMBEDDED_TIMER_WRAP_CLASS}
        style={INGAME_CHAT_EMBEDDED_TIMER_INSET}
        data-ingame-phase-timer="chat-embedded"
        aria-hidden={false}
      >
        <InGameTimebarExpandedTimer
          variant="standalone"
          remainingRatio={remainingRatio}
          remainingSec={remainingSec}
        />
      </div>
    )
  }

  if (typeof statusLabel !== "string" || statusLabel.length === 0) return null

  return (
    <>
      <InGameTimebarPhaseHeader label={statusLabel} />
      <InGameTimebarExpandedTimer
        remainingRatio={remainingRatio}
        remainingSec={remainingSec}
      />
    </>
  )
}
