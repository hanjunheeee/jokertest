// 모바일 명패+시간패널 스트립만 (시간 흐름바 틀·펼치기 없음)
// InGamePage·TalkLayout이 씀
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectInGameEntryPreparingActive } from "@/domains/game/ingame/utils/selectInGameEntryPreparing.js"
import { useTimebar } from "../../hooks/timebar/useTimebar.js"
// 데스크톱 시간 패널은 화면 부품이라 못 불러(모바일 경계 규칙) 같은 모양을 모바일 쪽에 둔 것을 씀
import PhaseTimerStrip from "./PhaseTimerStrip.jsx"

const ROOT_CLASS = "w-full px-0 py-0 [container-type:inline-size]"

export default function Timebar() {
  const bar = useTimebar(false)
  const entryPreparingActive = useInGameStore((s) => selectInGameEntryPreparingActive(s.state))
  const hasLabel = typeof bar.statusLabel === "string" && bar.statusLabel.length > 0
  const showStrip = hasLabel || entryPreparingActive

  return (
    <div
      className={ROOT_CLASS}
      data-ingame-phase-timer-mobile=""
      aria-label="단계 타이머"
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