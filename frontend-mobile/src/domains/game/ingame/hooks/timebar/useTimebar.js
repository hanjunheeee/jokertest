// 모바일 진행 바 값 훅: 날짜·지금 단계 노드·상태 글·마감 시각·남은 비율/초·펼침 상태
// 진행 바(Timebar)가 씀, 값 고르기는 데스크톱 InGamePage와 같은 선택 함수 그대로
import { useState } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { mapGamePhaseToTimebarPhaseId } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import { selectInGameTimebarPhaseDeadline } from "@/domains/game/ingame/utils/timebar/phaseDeadline.js"
import { selectInGameTimebarStatusLabel } from "@/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js"
import { useTurnProgress } from "@/domains/game/ingame/hooks/timebar/useTurnProgress.js"

// 처음엔 접힘 (데스크톱 진행 바 기본값과 같음, 배포 타이머 자리는 늘 시간 바)
const INITIAL_EXPANDED = false

// 낮 마감·밤 차례 마감 하나로 게이지 계산, 재판·끝남은 마감 없음
export function useTimebar() {
  const gameState = useInGameStore((s) => s.state)
  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const { remainingRatio, remainingSec } = useTurnProgress(phaseTurnDeadline)
  const [expanded, setExpanded] = useState(INITIAL_EXPANDED)

  // 날짜가 없으면 데스크톱 진행 바 기본값처럼 1일
  const day = Number.isInteger(gameState?.dayIndex) ? gameState.dayIndex : 1

  return {
    day,
    activePhaseId: mapGamePhaseToTimebarPhaseId(gameState?.phase),
    statusLabel: selectInGameTimebarStatusLabel(gameState),
    phaseTurnDeadline,
    remainingRatio,
    remainingSec,
    expanded,
    toggleExpanded: () => setExpanded((current) => !current),
  }
}
