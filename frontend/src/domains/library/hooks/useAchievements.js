import { useEffect, useRef } from "react"
import { useAchievementsStore } from "../store/achievements.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

// F-12: 서고 화면이 업적 진행률·달성 상태를 읽는 훅. 이 훅 자체는 조회만 한다(A-09) —
// evaluateAndGrantForUser는 게임/투표 이벤트가 이미 호출해 두었으므로, 여기서는 그 결과를
// 반영해 잔액·소유품을 최신으로 보여주기 위해 economy store를 한 번 더 읽어온다.
export function useAchievements() {
  const generation = useAchievementsStore((s) => s.requestGeneration)
  const status = useAchievementsStore((s) => s.status)
  const achievements = useAchievementsStore((s) => s.achievements)
  const error = useAchievementsStore((s) => s.error)
  const fetchAchievements = useAchievementsStore((s) => s.fetchAchievements)
  const retry = useAchievementsStore((s) => s.retry)

  useEffect(() => {
    if (useAchievementsStore.getState().achievements) return
    fetchAchievements()
  }, [generation, fetchAchievements])

  // 업적 조회가 이번 세대에서 처음 성공했을 때만 경제 상태를 한 번 새로 읽어온다 — 매
  // 렌더마다 다시 부르지 않기 위해 세대 번호로 중복 실행을 막는다.
  const refreshedGenerationRef = useRef(null)
  useEffect(() => {
    if (status !== "success") return
    if (refreshedGenerationRef.current === generation) return
    refreshedGenerationRef.current = generation
    useEconomyStore.getState().fetchSummary()
  }, [status, generation])

  const achievedIds = new Set((achievements ?? []).filter((a) => a.achieved).map((a) => a.id))

  return { status, achievements, achievedIds, error, retry }
}
