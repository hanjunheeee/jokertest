import { useEffect, useState } from "react"
import { computeInGameNightTurnRemainingSec } from "../utils/selectInGameNightTurnDeadline.js"

/**
 * 마감 시각(epoch ms) 하나에서 "남은 초"를 만들어 1초마다 갱신한다.
 *
 * 안내 오버레이의 자동 닫힘 타이머(INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)와는 완전히 다른
 * 시계다 — 안내는 고정 길이로 한 장이 사라지는 연출이고, 이쪽은 서버가 정한 턴 제한시간이다.
 * 둘을 한 타이머로 묶으면 안내 길이를 바꾸는 순간 턴 길이 표시까지 따라 바뀐다.
 *
 * deadline이 null이면(밤이 아니거나 턴이 없음) null을 돌려주고 타이머도 걸지 않는다.
 * deadline이 바뀌면 이전 인터벌은 정리되고 새 턴의 인터벌만 남는다 — 턴이 여러 번 바뀌어도
 * 타이머가 겹쳐 쌓이지 않는다.
 *
 * 값을 만드는 계산 자체는 순수 함수(computeInGameNightTurnRemainingSec)에 있고, 이 훅은 그것을
 * 언제 다시 부를지만 정한다.
 */
export function useInGameNightTurnCountdown(deadline) {
  const [remainingSec, setRemainingSec] = useState(() =>
    computeInGameNightTurnRemainingSec(deadline, Date.now()),
  )

  useEffect(() => {
    // 첫 표시를 인터벌의 첫 tick(1초 뒤)까지 기다리지 않는다 — 턴이 바뀐 순간 남은 시간이
    // 이전 턴 값으로 1초간 남아 있으면 역할과 숫자가 어긋나 보인다.
    setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    if (!Number.isFinite(deadline) || deadline <= 0) return undefined

    const timer = setInterval(() => {
      setRemainingSec(computeInGameNightTurnRemainingSec(deadline, Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return remainingSec
}
