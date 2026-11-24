// 결과 화면 실제 데이터: 인게임 스토어의 판 결과를 화면 값으로
// GameResultPage가 씀, 결과 없으면 null
import { useMemo, useState } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useInGameStore } from "../../ingame/store/ingameStore.js"
import { buildGameResultViewModel } from "../utils/buildGameResultViewModel.js"

// 판 명단이 없을 때 쓰는 빈 목록 (매번 새 배열이면 스토어 구독이 계속 다시 그림)
const NO_ROSTER = []

// 판 결과·내 uuid·내 진영 읽어 화면 값 만들기
export function useGameResultData() {
  const winResult = useInGameStore((s) => s.state?.winResult ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const selfTeam = useInGameStore((s) => s.state?.self?.team ?? null)
  const gameId = useInGameStore((s) => s.gameId ?? null)
  const ended = useInGameStore((s) => s.state?.phase === "ENDED")
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  // 판 명단: 공개 목록에 프로필 사진·테두리가 없을 때 보조
  const rosterPlayers = useInGameStore((s) => s.state?.players ?? NO_ROSTER)

  const built = useMemo(
    () => (winResult ? buildGameResultViewModel(winResult, selfUuid, selfTeam, { rosterPlayers }) : null),
    [winResult, selfUuid, selfTeam, rosterPlayers],
  )

  // 마지막으로 그린 결과를 판·계정과 같이 적어 둠 (그리는 중에 앞 값과 비교해 바로 맞춤)
  const [kept, setKept] = useState(null)
  if (built && (kept?.view !== built || kept.gameId !== gameId || kept.accountId !== accountId)) {
    setKept({ view: built, gameId, accountId })
  }
  if (built) return built
  // 다시 이어질 때 스냅샷 답이 반영 안 되면 확인 못 한 승패 결과가 지워짐 → 같은 판·같은 계정·판 끝 그대로면 받아 둔 결과를 계속 보여 줌
  // 안 그러면 "다시 눌러 주세요" 안내 뒤 결과 화면이 "확인할 수 없음"으로 바뀌어 누를 단추가 없음 (판·계정이 바뀌었거나 판을 비웠으면 안 보여 줌)
  if (kept && gameId !== null && kept.gameId === gameId && kept.accountId === accountId && ended) return kept.view
  return null
}
