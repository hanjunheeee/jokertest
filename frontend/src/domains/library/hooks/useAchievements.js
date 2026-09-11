import { useCallback, useEffect } from "react"
import { useAchievementsStore } from "../store/achievements.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"

// F-12: 서고 화면이 업적 진행률·달성 상태를 읽는 훅. 이 훅 자체는 조회만 한다(A-09) —
// evaluateAndGrantForUser는 게임/투표 이벤트가 이미 호출해 두었으므로, 여기서는 그 결과를
// 반영해 잔액·소유품을 최신으로 보여주기 위해 economy store를 한 번 더 읽어온다.
//
// CODEX-2 재검토(AC-06): 이전 버전은 (1) 이미 achievements가 있으면 마운트해도 다시
// 조회하지 않았고, (2) 경제 상태도 "세대(로그인 세션)당 최초 성공 1회"만(store에 남아있는
// 이전 성공 상태 여부로 판단) 다시 읽어왔다. 그래서 서고 페이지를 벗어났다가 그 사이 새
// 게임/투표로 업적이 추가로 지급된 뒤 다시 들어와도, 페이지를 새로고침하지 않는 한
// 진행률·달성·재화·테두리 소유 상태가 전혀 갱신되지 않았다("지급 완료 후 갱신을 보장하지
// 못한다"는 지적). 이제 마운트(또는 계정 전환)할 때마다 항상 다시 조회하고(A-09: GET은
// 부작용이 없으므로 안전하다), 그 "이번에 직접 트리거한" 조회가 성공할 때만 경제 상태를
// 함께 새로 읽어온다 — 마운트 시점에 store에 이미 남아있던(다른 마운트가 남긴) 오래된
// success 상태를 보고 잘못 트리거하지 않도록, achievements 값 자체가 아니라 "이번 호출의
// 완료"를 신호로 쓴다.
export function useAchievements() {
  const generation = useAchievementsStore((s) => s.requestGeneration)
  const status = useAchievementsStore((s) => s.status)
  const achievements = useAchievementsStore((s) => s.achievements)
  const error = useAchievementsStore((s) => s.error)
  const fetchAchievements = useAchievementsStore((s) => s.fetchAchievements)
  const storeRetry = useAchievementsStore((s) => s.retry)

  // CODEX-3 재검토(AC-06): 마운트 효과가 끝난 뒤(성공 시에만) 경제 상태를 다시 읽어오는
  // 로직을 재사용 가능한 콜백으로 뽑아, retry도 같은 계약을 따르게 한다 — 이전 버전은 이
  // 갱신을 마운트 효과 안에서만 인라인으로 했고, 화면이 store.retry를 그대로 노출해
  // "재시도 성공"이 경제 갱신으로 이어지지 않았다(재시도로 업적이 새로 지급 상태가 돼도
  // 재화·소유품·테두리 화면은 갱신되지 않는 버그).
  const syncEconomyIfSuccess = useCallback(() => {
    if (useAchievementsStore.getState().status === "success") {
      useEconomyStore.getState().fetchSummary()
    }
  }, [])

  // generation이 바뀌면(계정 전환/로그아웃 reset) 다시 조회하고, 컴포넌트가 다시
  // 마운트돼도(재진입) 항상 다시 조회한다 — 더 이상 "이미 캐시된 값이 있으면 건너뛴다"는
  // 조건으로 재진입 시 갱신을 막지 않는다(A-09: GET은 부작용이 없어 반복 호출해도 안전하다).
  // 이 호출이 실제로 성공한 경우에만(다른 더 나중 호출에 밀려 폐기되지 않았다면) 경제
  // 상태도 함께 새로 읽어온다.
  useEffect(() => {
    let active = true
    fetchAchievements().then(() => {
      if (!active) return
      syncEconomyIfSuccess()
    })
    return () => { active = false }
  }, [generation, fetchAchievements, syncEconomyIfSuccess])

  // 화면이 부르는 retry는 store.retry를 그대로 넘기지 않는다 — 재시도가 성공하면 마운트
  // 효과와 동일하게 경제 상태도 함께 새로 읽어와야 한다(CODEX-3 재검토 AC-06).
  const retry = useCallback(() => storeRetry().then(syncEconomyIfSuccess), [storeRetry, syncEconomyIfSuccess])

  const achievedIds = new Set((achievements ?? []).filter((a) => a.achieved).map((a) => a.id))
  const grantedIds = new Set((achievements ?? []).filter((a) => a.granted).map((a) => a.id))

  return { status, achievements, achievedIds, grantedIds, error, retry }
}
