// 업적 목록 받기 훅 (화면 열 때 받고, 성공하면 재화 요약도 새로 받음)
// forbiddenRecords/ForbiddenRecordsRightPage.jsx가 씀
import { useCallback, useEffect } from "react"
import { useAchievementsStore } from "../store/achievements.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

// 스토어 값 꺼내 주고, 이룬 업적·보상 받은 업적 id 묶음 만듦
export function useAchievements() {
  const generation = useAchievementsStore((s) => s.requestGeneration)
  const status = useAchievementsStore((s) => s.status)
  const achievements = useAchievementsStore((s) => s.achievements)
  const error = useAchievementsStore((s) => s.error)
  const fetchAchievements = useAchievementsStore((s) => s.fetchAchievements)
  const storeRetry = useAchievementsStore((s) => s.retry)

  // 성공일 때만 재화 요약 다시 받음 (업적 보상 재화가 화면에 맞게)
  const syncEconomyIfSuccess = useCallback((outcome) => {
    if (outcome?.outcome === "success") {
      useEconomyStore.getState().fetchSummary()
    }
  }, [])

  // 열 때·초기화로 generation 바뀔 때 다시 받음, 닫힌 뒤 온 결과는 버림
  useEffect(() => {
    let active = true
    fetchAchievements().then((outcome) => {
      if (!active) return
      syncEconomyIfSuccess(outcome)
    })
    return () => { active = false }
  }, [generation, fetchAchievements, syncEconomyIfSuccess])

  // 다시 시도도 성공하면 재화 새로 받음
  const retry = useCallback(() => storeRetry().then(syncEconomyIfSuccess), [storeRetry, syncEconomyIfSuccess])

  // 이룬 업적·보상 받은 업적 id 묶음 (지금은 시험만 씀)
  const achievedIds = new Set((achievements ?? []).filter((a) => a.achieved).map((a) => a.id))
  const grantedIds = new Set((achievements ?? []).filter((a) => a.granted).map((a) => a.id))

  return { status, achievements, achievedIds, grantedIds, error, retry }
}
