import { useCallback, useEffect, useState } from "react"
import {
  INGAME_TIMER_PLACEMENT,
  readInGameTimerPlacement,
  writeInGameTimerPlacement,
} from "../constants/timebar/ingameTimerPlacement.js"

/** DEV: Ctrl+Shift+T로 timebar ↔ chat 전환. localStorage에 저장한다. */
export function useInGameTimerPlacement() {
  const [timerPlacement, setTimerPlacementState] = useState(() => readInGameTimerPlacement())

  const setTimerPlacement = useCallback((next) => {
    writeInGameTimerPlacement(next)
    setTimerPlacementState(next)
  }, [])

  const cycleTimerPlacement = useCallback(() => {
    setTimerPlacementState((prev) => {
      const next =
        prev === INGAME_TIMER_PLACEMENT.CHAT
          ? INGAME_TIMER_PLACEMENT.TIMEBAR
          : INGAME_TIMER_PLACEMENT.CHAT
      writeInGameTimerPlacement(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault()
        cycleTimerPlacement()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cycleTimerPlacement])

  return { timerPlacement, setTimerPlacement, cycleTimerPlacement }
}
