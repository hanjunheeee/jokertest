// 결과 화면 실제 데이터: 인게임 스토어의 판 결과를 화면 값으로
// GameResultPage가 씀, 결과 없으면 null
import { useMemo } from "react"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

// 판 결과·내 uuid·내 진영 읽어 화면 값 만들기
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const selfTeam = useInGameStore((s) => s.state?.self?.team ?? null)

  return useMemo(
    () => (winResult ? buildGameResultViewModel(winResult, selfUuid, selfTeam) : null),
    [winResult, selfUuid, selfTeam],
  )
}
