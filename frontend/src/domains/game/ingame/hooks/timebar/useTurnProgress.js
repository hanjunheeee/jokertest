// 단계 타이머 진행 훅: 마감 시각 하나로 게이지 비율·남은 초를 화면 새로 그릴 때마다 다시 셈
// 인게임 화면(InGamePage)·진행 바(InGameTimebar)가 사용
import { useEffect, useRef, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../../utils/selectInGameNightTurnDeadline.js"

// 마감이 바뀐 그 순간의 (마감 - 지금)을 전체 길이로 잡고 1 → 0으로 줄임
export function useTurnProgress(deadline) {
  const turnSpanRef = useRef(null)
  const [remainingRatio, setRemainingRatio] = useState(0)
  const [remainingSec, setRemainingSec] = useState(null)

  useEffect(() => {
    // 마감 없거나 틀리면 빈 게이지·셀 시간 없음
    if (!Number.isFinite(deadline) || deadline <= 0) {
      turnSpanRef.current = null
      setRemainingRatio(0)
      setRemainingSec(null)
      return undefined
    }

    const now = Date.now()
    const spanMs = Math.max(deadline - now, 1)
    turnSpanRef.current = { startMs: deadline - spanMs, endMs: deadline }

    // 그릴 때마다 남은 비율·초 다시 셈 (정리 때 다음 그리기 취소)
    let frameId = null
    const tick = () => {
      const span = turnSpanRef.current
      if (!span) return
      const current = Date.now()
      const total = Math.max(span.endMs - span.startMs, 1)
      const remainingMs = Math.max(0, span.endMs - current)
      setRemainingRatio(Math.min(1, remainingMs / total))
      setRemainingSec(computeInGameNightTurnRemainingSec(span.endMs, current))
      frameId = requestAnimationFrame(tick)
    }

    tick()
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [deadline])

  return { remainingRatio, remainingSec }
}
