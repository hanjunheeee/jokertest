import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useInGameStore } from "../store/ingameStore.js"

/**
 * 게임이 실제로 끝났을 때(phase ENDED + winResult 확정) 결과 페이지로 정확히 한 번 이동시킨다.
 *
 * 이 훅은 store를 전혀 건드리지 않는다 — clearGame()을 부르지 않으므로 결과 페이지가 읽어야 할
 * winResult가 그대로 살아남는다. 세션 정리(clearGame + /multiplay)는 기존대로 이탈·game_ended
 * 경로의 createSessionEndFinalizer만 담당한다.
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 재생 중이거나 대기 중인 사망 연출(killReveal 큐)이 있는가.
 *   true인 동안에는 이동을 미룬다 — 지금 넘어가면 그 밤의 사망 연출이 통째로 잘린다.
 * @flow ENDED·winResult·hold 세 조건이 처음으로 모두 갖춰진 순간에만 navigate하고, 그 뒤로는
 *   ref 가드가 재호출을 막는다(StrictMode 이중 effect·리렌더 포함). replace로 이동하므로
 *   뒤로가기로 종료된 인게임 화면에 되돌아가지 않는다(useInGameExit의 POP 차단은 REPLACE를
 *   막지 않으므로 그 계약과 충돌하지 않는다).
 */
export function useInGameResultNavigation({ hold = false } = {}) {
  const navigate = useNavigate()
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const hasWinResult = useInGameStore((s) => Boolean(s.state?.winResult))
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (navigatedRef.current) return
    if (phase !== "ENDED") return
    // winResult 없이 이동하면 결과 페이지가 그릴 것이 없어 즉시 로비로 튕겨 나간다.
    if (!hasWinResult) return
    if (hold) return

    navigatedRef.current = true
    navigate("/gameresult", { replace: true })
  }, [phase, hasWinResult, hold, navigate])
}
