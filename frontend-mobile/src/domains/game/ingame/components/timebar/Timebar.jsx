// 모바일 명패+시간패널 스트립만 (시간 흐름바 틀·펼치기 없음)
// InGamePage·TalkLayout이 씀
import { PHASE_SETTLE_ATTR } from "@/domains/game/ingame/constants/timebar/ingamePhaseActions.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectInGameEntryPreparingActive } from "@/domains/game/ingame/utils/selectInGameEntryPreparing.js"
import { useTimebar } from "../../hooks/timebar/useTimebar.js"
import PhaseTimerStrip from "./PhaseTimerStrip.jsx"

const ROOT_CLASS = "w-full px-0 py-0 [container-type:inline-size]"

export default function Timebar() {
  const bar = useTimebar(false)
  const entryPreparingActive = useInGameStore((s) => selectInGameEntryPreparingActive(s.state))
  const hasLabel = typeof bar.statusLabel === "string" && bar.statusLabel.length > 0
  const showStrip = hasLabel || entryPreparingActive
  // 표가 다 차 마감이 5초 뒤로 당겨진 동안만 붙는 표시 (데스크톱 시간 바와 같음, 시험이 찾음)
  const settleMark = bar.settled ? { [PHASE_SETTLE_ATTR]: "" } : {}

  return (
    <div
      className={ROOT_CLASS}
      data-ingame-phase-timer-mobile=""
      aria-label="단계 타이머"
      {...settleMark}
    >
      {showStrip ? (
        <PhaseTimerStrip
          statusLabel={bar.statusLabel}
          remainingSec={bar.remainingSec}
          showResourcesWithoutLabel={entryPreparingActive && !hasLabel}
        />
      ) : null}
    </div>
  )
}
