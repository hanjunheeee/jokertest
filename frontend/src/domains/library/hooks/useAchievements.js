import { useCallback, useEffect } from "react"
import { useAchievementsStore } from "../store/achievements.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

export function useAchievements() {
  const generation = useAchievementsStore((s) => s.requestGeneration)
  const status = useAchievementsStore((s) => s.status)
  const achievements = useAchievementsStore((s) => s.achievements)
  const error = useAchievementsStore((s) => s.error)
  const fetchAchievements = useAchievementsStore((s) => s.fetchAchievements)
  const storeRetry = useAchievementsStore((s) => s.retry)

  const syncEconomyIfSuccess = useCallback((outcome) => {
    if (outcome?.outcome === "success") {
      useEconomyStore.getState().fetchSummary()
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchAchievements().then((outcome) => {
      if (!active) return
      syncEconomyIfSuccess(outcome)
    })
    return () => { active = false }
  }, [generation, fetchAchievements, syncEconomyIfSuccess])

  const retry = useCallback(() => storeRetry().then(syncEconomyIfSuccess), [storeRetry, syncEconomyIfSuccess])

  const achievedIds = new Set((achievements ?? []).filter((a) => a.achieved).map((a) => a.id))
  const grantedIds = new Set((achievements ?? []).filter((a) => a.granted).map((a) => a.id))

  return { status, achievements, achievedIds, grantedIds, error, retry }
}
