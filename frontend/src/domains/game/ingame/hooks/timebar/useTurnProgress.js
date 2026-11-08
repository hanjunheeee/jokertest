// 단계 타이머 진행 훅: 마감 시각 하나로 게이지 비율·남은 초를 짧은 간격으로 다시 셈
// 인게임 화면(InGamePage)·진행 바(InGameTimebar)·모바일 진행 바가 사용
import { useLayoutEffect, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../../utils/selectInGameNightTurnDeadline.js"

// 다시 세는 간격 (ms): 매 화면 그리기(초당 60번)마다 세면 화면 전체가 너무 자주 다시 그려짐
export const TURN_PROGRESS_TICK_MS = 250

const EMPTY_PROGRESS = Object.freeze({ deadline: null, remainingRatio: 0, remainingSec: null })

// 마감이 바뀐 그 순간의 (마감 - 지금)을 전체 길이로 잡고 1 → 0으로 줄임, 마감 지나면 멈춤
export function useTurnProgress(deadline) {
  const valid = Number.isFinite(deadline) && deadline > 0
  const [progress, setProgress] = useState(EMPTY_PROGRESS)

  // 그리기 전에 첫 값을 넣어 빈 게이지가 한 번 비치지 않게 함
  useLayoutEffect(() => {
    if (!valid) return undefined
    const startMs = Date.now()
    const spanMs = Math.max(deadline - startMs, 1)

    let timerId = null
    const tick = () => {
      timerId = null
      const current = Date.now()
      const remainingMs = Math.max(0, deadline - current)
      const remainingRatio = Math.min(1, remainingMs / spanMs)
      const remainingSec = computeInGameNightTurnRemainingSec(deadline, current)
      // 값이 같으면 같은 상태 그대로 (다시 그리기 막기)
      setProgress((prev) => (
        prev.deadline === deadline
          && prev.remainingRatio === remainingRatio
          && prev.remainingSec === remainingSec
          ? prev
          : { deadline, remainingRatio, remainingSec }
      ))
      // 마감 지나면 더 안 셈
      if (remainingMs > 0) timerId = setTimeout(tick, TURN_PROGRESS_TICK_MS)
    }

    tick()
    return () => {
      if (timerId !== null) clearTimeout(timerId)
    }
  }, [deadline, valid])

  // 마감 없거나 틀리면 빈 게이지·남은 초 없음, 다른 마감의 옛 값은 안 씀
  if (!valid || progress.deadline !== deadline) {
    return { remainingRatio: 0, remainingSec: null }
  }
  return { remainingRatio: progress.remainingRatio, remainingSec: progress.remainingSec }
}
