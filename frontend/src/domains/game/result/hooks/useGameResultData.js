import { useMemo } from "react"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const selfTeam = useInGameStore((s) => s.state?.self?.team ?? null)

  return useMemo(
    () => (winResult ? buildGameResultViewModel(winResult, selfUuid, selfTeam) : null),
    [winResult, selfUuid, selfTeam],
  )
}
