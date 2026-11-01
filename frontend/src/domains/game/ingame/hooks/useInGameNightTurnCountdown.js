// 밤 차례 남은 초 훅: 마감 시각까지 1초마다 남은 초를 다시 셈
// 인게임 화면(InGamePage)이 시간 막대 문구에 사용
import { useEffect, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../utils/selectInGameNightTurnDeadline.js"

// 남은 초 돌려줌 (마감이 바뀌면 바로 다시 셈)
export function useInGameNightTurnCountdown(deadline) {
  const [remainingSec, setRemainingSec] = useState(() =>
    computeInGameNightTurnRemainingSec(deadline, Date.now()),
  )

  useEffect(() => {
    setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    // 마감이 없으면 1초 타이머를 안 둠
    if (!Number.isFinite(deadline) || deadline <= 0) return undefined

    const timer = setInterval(() => {
      setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return remainingSec
}
