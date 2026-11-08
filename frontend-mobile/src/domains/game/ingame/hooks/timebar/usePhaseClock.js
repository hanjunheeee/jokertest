// 위 단계 줄 값: 날짜·상태 글·남은 초 (남은 초는 1초에 한 번만 다시 셈)
// 카톡형 PhaseLine이 씀, 게이지가 필요 없어 진행 바 훅(250ms)보다 덜 자주 그림
import { useEffect, useState } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectInGameTimebarPhaseDeadline } from "@/domains/game/ingame/utils/timebar/phaseDeadline.js"
import { selectInGameTimebarStatusLabel } from "@/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js"
import { computeInGameNightTurnRemainingSec } from "@/domains/game/ingame/utils/selectInGameNightTurnDeadline.js"

const TICK_MS = 1000

export function usePhaseClock() {
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const statusLabel = useInGameStore((s) => selectInGameTimebarStatusLabel(s.state ?? null))
  const deadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const [now, setNow] = useState(() => Date.now())

  // 마감이 있는 동안만 1초마다 셈, 마감 지나면 멈춤
  useEffect(() => {
    if (!Number.isFinite(deadline) || deadline <= 0) return undefined
    let id = null
    const tick = () => {
      const current = Date.now()
      setNow(current)
      id = current < deadline ? setTimeout(tick, TICK_MS) : null
    }
    // 새 마감은 바로 한 번 셈 (옛 시각으로 1초 남짓 틀리지 않게)
    id = setTimeout(tick, 0)
    return () => clearTimeout(id)
  }, [deadline])

  return {
    day: Number.isInteger(dayIndex) ? dayIndex : 1,
    statusLabel,
    remainingSec: computeInGameNightTurnRemainingSec(deadline, now),
  }
}
