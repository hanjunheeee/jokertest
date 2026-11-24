// 모바일 명패+시간패널 한 줄 (게이지 없음, 남은 초만): 데스크톱 InGamePhaseTurnTimerPanel 시간 바·"mobile" 배치와 같은 모양
// Timebar가 씀, 배치 값은 데스크톱 상수 getEmbeddedChatTimerLayout("mobile") 그대로 (화면 파일은 모바일 쪽에 따로 둠)
import { getEmbeddedChatTimerLayout } from "@/domains/game/ingame/constants/chat/ingameChatTimerLayout.js"
import { formatInGameTimebarClock } from "@/domains/game/ingame/utils/timebar/format.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 모바일 배치 하나만 씀
const LAYOUT_KEY = "mobile"

// 명패 글이 없어도 showResourcesWithoutLabel이면 빈 명패·00:00으로 틀만 보임 (입장 준비 중)
export default function PhaseTimerStrip({ statusLabel = null, remainingSec = null, showResourcesWithoutLabel = false }) {
  const hasLabel = typeof statusLabel === "string" && statusLabel.length > 0
  if (!hasLabel && !showResourcesWithoutLabel) return null

  const layout = getEmbeddedChatTimerLayout(LAYOUT_KEY)
  const hasActiveCountdown = Number.isFinite(remainingSec) && remainingSec >= 0
  // 예: 75초 → 시계 글, 남은 초 없으면 "00:00"
  const clockText = hasActiveCountdown ? formatInGameTimebarClock(remainingSec) : "00:00"

  return (
    <div
      className={layout.wrapClass}
      style={layout.stackInset}
      data-ingame-phase-timer="timebar-embedded"
      data-ingame-phase-timer-layout={LAYOUT_KEY}
      aria-hidden={false}
    >
      <div className={layout.unifiedStripClass} data-ingame-chat-phase-timer-strip="">
        {layout.showStripFrameImage && layout.unifiedFrameSrc ? (
          <PublicAsset src={layout.unifiedFrameSrc} alt="" className={layout.unifiedFrameImageClass} />
        ) : null}
        <p className={layout.unifiedStatusClass}>{hasLabel ? statusLabel : ""}</p>
        <span className={layout.unifiedDigitsClass} role="timer">
          {clockText}
        </span>
      </div>
    </div>
  )
}
