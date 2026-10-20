import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  isTerminalResultFromOtherAccount,
  readInGameReceiptScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"

/**
 * 게임이 실제로 끝났을 때(phase ENDED + winResult 확정) 결과 페이지로 정확히 한 번 이동시킨다.
 *
 * 이 훅은 store를 전혀 건드리지 않는다 — clearGame()을 부르지 않으므로 결과 페이지가 읽어야 할
 * winResult가 그대로 살아남는다. 세션 정리(clearGame + /multiplay)는 기존대로 이탈·game_ended
 * 경로의 createSessionEndFinalizer만 담당한다.
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 재생 중·대기 중인 밤 성공 연출이 있거나 신원 재결속 중인가.
 *   true인 동안에는 이동을 미룬다 — 지금 넘어가면 그 밤의 개인 연출이 통째로 잘린다.
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
    /**
     * F-23(SPLIT-1): 이 종료 결과를 **다른 인증 신원이** 받았다는 것이 확인되면 이동하지 않는다.
     * 인증 전이의 재결속 보류(hold)는 그 전이를 관측한 effect가 올리는데, 그 effect는 이 렌더
     * **뒤에** 돈다 — 그 한 틈에 이전 계정이 받아 둔 결과로 화면이 떠나 버리는 자리가 있다
     * (인증 A→B→A 왕복은 판·소속·소켓 객체·sid를 하나도 바꾸지 않으므로 그 틈이 실제로 열린다).
     *
     * 값을 렌더 중에 구독하지 않고 **이동하려는 이 순간**에 직접 읽는다 — 판단에 필요한 것은
     * 지금의 인증 범위와 그 결과의 수신 기록뿐이고, 둘 다 동기적으로 읽을 수 있다. 이 문턱은
     * "확실히 남의 계정이 받았다"일 때만 막고(store의 isTerminalResultFromOtherAccount 참고),
     * 그 뒤 실제로 걷어낼지는 기존 재결속 경로가 결정한다 — 현재 신원의 정상 스냅샷이 종료를
     * 다시 실으면 그 기록이 현재 계정의 것이 되어 이동이 재개된다.
     */
    const auth = useAuthStore.getState()
    if (isTerminalResultFromOtherAccount(readInGameReceiptScope({
      accountId: auth.user?.uuid ?? null,
      identityGeneration: auth.identityGeneration ?? null,
    }))) return

    navigatedRef.current = true
    navigate("/gameresult", { replace: true })
  }, [phase, hasWinResult, hold, navigate])
}
