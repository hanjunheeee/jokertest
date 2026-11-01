// 단계 타이머 묶음: 자리에 따라 채팅 틀 안 타이머만, 또는 확대 시간 바의 단계 머리 + 타이머
// 진행 바(InGameTimebar)·채팅 내용(InGameChatContent)이 사용
import {
  EMBEDDED_TIMER_INSET,
  EMBEDDED_TIMER_WRAP_CLASS,
} from "../../constants/chat/ingameChatTimerLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGameTimebarExpandedTimer from "./InGameTimebarExpandedTimer.jsx"
import InGameTimebarPhaseHeader from "./InGameTimebarPhaseHeader.jsx"

// 채팅 자리는 글 없이 타이머만, 시간 바 자리는 상태 글이 있어야 그림
export default function InGamePhaseTurnTimerPanel({
  statusLabel = null,
  remainingRatio = 0,
  remainingSec = null,
  placement = INGAME_TIMER_PLACEMENT.TIMEBAR,
}) {
  if (placement === INGAME_TIMER_PLACEMENT.CHAT) {
    return (
      <div
        className={EMBEDDED_TIMER_WRAP_CLASS}
        style={EMBEDDED_TIMER_INSET}
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
