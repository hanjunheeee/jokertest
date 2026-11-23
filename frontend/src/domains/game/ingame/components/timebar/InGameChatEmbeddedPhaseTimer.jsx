// 채팅 틀 상단 단계 타이머: 명패+시간패널 일체 프레임 (게이지 없음)
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)이 타이머:채팅 배치일 때 사용
import { getEmbeddedChatTimerLayout } from "../../constants/chat/ingameChatTimerLayout.js"
import { formatInGameTimebarClock } from "../../utils/timebar/format.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function InGameChatEmbeddedPhaseTimer({
  statusLabel = null,
  remainingSec = null,
  embeddedLayout = "board",
  showResourcesWithoutLabel = false,
}) {
  const layout = getEmbeddedChatTimerLayout(embeddedLayout)
  const hasLabel = typeof statusLabel === "string" && statusLabel.length > 0
  const showStrip = hasLabel || showResourcesWithoutLabel
  const hasActiveCountdown = Number.isFinite(remainingSec) && remainingSec >= 0
  const clockText = hasActiveCountdown
    ? formatInGameTimebarClock(remainingSec)
    : "00:00"

  if (!showStrip) return null

  const labelText = hasLabel ? statusLabel : ""

  return (
    <div className={layout.unifiedStripClass} data-ingame-chat-phase-timer-strip="">
      {layout.showStripFrameImage && layout.unifiedFrameSrc ? (
        <PublicAsset
          src={layout.unifiedFrameSrc}
          alt=""
          className={layout.unifiedFrameImageClass}
        />
      ) : null}
      <p className={layout.unifiedStatusClass}>{labelText}</p>
      <span className={layout.unifiedDigitsClass} role="timer">
        {clockText}
      </span>
    </div>
  )
}