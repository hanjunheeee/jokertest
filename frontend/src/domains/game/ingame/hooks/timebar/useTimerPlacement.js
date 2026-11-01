// 단계 타이머 자리 훅: 처음 자리 읽기·바꾸기·저장, 개발 땐 Ctrl+Shift+T로 전환
// 인게임 화면(InGamePage)이 사용
import { useCallback, useEffect, useState } from "react"
import {
  INGAME_TIMER_PLACEMENT,
  readInGameTimerPlacement,
  writeInGameTimerPlacement,
} from "../../constants/timebar/ingameTimerPlacement.js"

// 자리 값과 정하기·돌리기 함수 돌려줌 (바꿀 때마다 저장)
export function useTimerPlacement() {
  const [timerPlacement, setTimerPlacementState] = useState(() => readInGameTimerPlacement())

  const setTimerPlacement = useCallback((next) => {
    writeInGameTimerPlacement(next)
    setTimerPlacementState(next)
  }, [])

  // 시간 바 ↔ 채팅 번갈아
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

  // 단축키는 개발 빌드에서만
  useEffect(() => {
    if (import.meta.env?.DEV !== true) return undefined
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
