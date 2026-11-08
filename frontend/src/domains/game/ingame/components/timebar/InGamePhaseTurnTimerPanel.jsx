// 단계 타이머 묶음: 자리에 따라 채팅 틀 안 타이머만, 또는 확대 시간 바의 단계 머리 + 타이머
// 진행 바(InGameTimebar)·채팅 내용(InGameChatContent)이 사용
import { getEmbeddedChatTimerLayout } from "../../constants/chat/ingameChatTimerLayout.js"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGameTimebarExpandedTimer from "./InGameTimebarExpandedTimer.jsx"
import InGameTimebarPhaseHeader from "./InGameTimebarPhaseHeader.jsx"

// 채팅 자리는 글 없이 타이머만, 시간 바 자리는 상태 글이 있어야 그림
export default function InGamePhaseTurnTimerPanel({
  statusLabel = null,
  remainingRatio = 0,
  remainingSec = null,
  placement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  embeddedLayout = "board",
}) {
  if (placement === INGAME_TIMER_PLACEMENT.CHAT) {
    const layout = getEmbeddedChatTimerLayout(embeddedLayout)

    return (
      <div
        className={layout.wrapClass}
        style={layout.stackInset}
        data-ingame-phase-timer="chat-embedded"
        data-ingame-phase-timer-layout={embeddedLayout}
        aria-hidden={false}
      >
        {typeof statusLabel === "string" && statusLabel.length > 0 ? (
          <InGameTimebarPhaseHeader
            label={statusLabel}
            wrapClassName={layout.phaseHeaderWrapClass}
            titleClassName={layout.phaseHeaderTitleClass ?? undefined}
            plateSrc={layout.phaseHeaderPlateSrc}
          />
        ) : null}
        <div className={layout.timerBodyClass}>
          <InGameTimebarExpandedTimer
            variant="standalone"
            digitsClassName={layout.timerDigitsClass ?? undefined}
            markerClassName={layout.timerMarkerClass ?? undefined}
            remainingRatio={remainingRatio}
            remainingSec={remainingSec}
          />
        </div>
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
