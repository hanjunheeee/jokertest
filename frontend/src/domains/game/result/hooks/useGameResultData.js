// 결과 화면 실제 데이터: 인게임 스토어의 판 결과를 화면 값으로
// GameResultPage가 씀, 결과 없으면 null
import { useMemo, useRef } from "react"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

// 판 결과·내 uuid·내 진영 읽어 화면 값 만들기
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const selfTeam = useInGameStore((s) => s.state?.self?.team ?? null)
  const rosterPlayers = useInGameStore((s) => s.state?.players ?? [])
  const phase = useInGameStore((s) => s.state?.phase ?? null)

  // 판 끝 직후 스냅샷이 승/패를 흔들지 않게 첫 값으로 고정 (연출이 다시 돌지 않게)
  const pinnedRef = useRef(null)
  if (phase === "ENDED" && winResult && pinnedRef.current === null) {
    pinnedRef.current = { winResult, selfUuid, selfTeam, rosterPlayers }
  }
  const source = pinnedRef.current ?? { winResult, selfUuid, selfTeam, rosterPlayers }

  return useMemo(
    () => (
      source.winResult
        ? buildGameResultViewModel(source.winResult, source.selfUuid, source.selfTeam, {
            rosterPlayers: source.rosterPlayers,
          })
        : null
    ),
    [source.winResult, source.selfUuid, source.selfTeam, source.rosterPlayers],
  )
}
