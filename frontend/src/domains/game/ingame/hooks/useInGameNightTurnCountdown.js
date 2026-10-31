import { useEffect, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../utils/selectInGameNightTurnDeadline.js"

export function useInGameNightTurnCountdown(deadline) {
  const [remainingSec, setRemainingSec] = useState(() =>
    computeInGameNightTurnRemainingSec(deadline, Date.now()),
  )

  useEffect(() => {
    setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    if (!Number.isFinite(deadline) || deadline <= 0) return undefined

    const timer = setInterval(() => {
      setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return remainingSec
}
