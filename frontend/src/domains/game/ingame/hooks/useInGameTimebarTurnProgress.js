import { useEffect, useRef, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../utils/selectInGameNightTurnDeadline.js"

/**
 * nightTurnDeadline(절대 ms) 하나에서 게이지 비율·남은 초를 rAF로 갱신한다.
 * 턴(deadline)이 바뀌면 그 시점의 (deadline - now)를 전체 길이로 잡고 1에서 0으로 줄인다.
 */
export function useInGameTimebarTurnProgress(deadline) {
  const turnSpanRef = useRef(null)
  const [remainingRatio, setRemainingRatio] = useState(0)
  const [remainingSec, setRemainingSec] = useState(null)

  useEffect(() => {
    if (!Number.isFinite(deadline) || deadline <= 0) {
      turnSpanRef.current = null
      setRemainingRatio(0)
      setRemainingSec(null)
      return undefined
    }

    const now = Date.now()
    const spanMs = Math.max(deadline - now, 1)
    turnSpanRef.current = { startMs: deadline - spanMs, endMs: deadline }

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
