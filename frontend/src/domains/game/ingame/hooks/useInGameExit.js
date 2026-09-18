import { useCallback, useEffect, useRef, useState } from "react"
import { useBlocker, useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createLeaveGameSessionRequest } from "../utils/createLeaveGameSessionRequest.js"
import { createExitConfirmController } from "../utils/createExitConfirmController.js"
import { isPopNavigationBlocked } from "../utils/isPopNavigationBlocked.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

/**
 * ACK를 기다리는 유한 상한. 넘어가면 **성공으로 바꾸지 않고** "결과 미확정"으로 표시한다 —
 * 서버가 이미 커밋했을 수도, 아무것도 하지 않았을 수도 있으므로 화면이 단정하지 않는다.
 */
export const IN_GAME_EXIT_ACK_TIMEOUT_MS = 8000

/** 나가기 요청의 수명. 페이지 버튼·안내·재시도가 전부 이 한 값을 소비한다. */
const EXIT_STATUS = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
  FAILED: "failed",
  UNRESOLVED: "unresolved",
})

/**
 * 인게임 나가기 버튼과 앱 내부 뒤로가기(POP)를 같은 확인·leave_game_session 계약으로
 * 묶는다. 둘 다 createExitConfirmController를 거치므로, 확인 대화상자를 취소하면 어느
 * 진입점에서도 인게임 화면에 남고 아무 이벤트도 전송되지 않는다.
 *
 * 성공 ack·game_ended에 따른 로비 이동은 finalize의 navigate(PUSH 아님, replace)로 이뤄지며
 * isPopNavigationBlocked는 POP만 가로채므로 그 이동 자체는 차단되지 않는다. 실제 탭
 * 종료·새로고침처럼 가로챌 수 없는 이탈은 여기서 다루지 않고 기존 disconnect
 * fallback(useGameSessionSocketEvents의 자신의 disconnect 처리)에 맡긴다.
 *
 * ── F-23(AC-06): 요청의 수명을 화면이 소비한다 ────────────────────────────────
 *
 * 예전에는 요청을 보내고 성공 ack만 finalize에 이었다. 실패 ack·응답 없음은 **아무 흔적도
 * 남기지 않아서**, 방장이 나가기를 눌렀는데 화면이 그대로인 이유를 알 수 없었고 같은 요청을
 * 여러 번 보낼 수도 있었다. 이제 네 상태(idle·pending·failed·unresolved)를 돌려주고,
 * 다음 세 가지를 지킨다:
 *
 *   1. **단일 요청.** 요청 컨트롤러와 진행 상태는 ref가 소유한다 — 리렌더마다 새로 만들면
 *      pending을 잃고 중복 전송이 열린다. pending 동안의 추가 클릭·POP은 전송 0이다.
 *   2. **정리·이동은 정확히 한 번.** 성공 ack, 뒤늦은 중복 ack, 권위 확인 응답이 겹쳐도
 *      settledRef가 한 번만 통과시킨다.
 *   3. **미확정은 성공이 아니다.** timeout·전송 실패·INTERNAL_ERROR로는 절대 이동하지 않고,
 *      **현재 신원·현재 연결의 권위 있는 확인**(get_session_snapshot의 FORFEITED_FROM_SESSION
 *      또는 같은 판의 유효한 멱등 leave 성공)을 받은 뒤에만 정리한다.
 */
export function useInGameExit() {
  const navigate = useNavigate()
  const blocker = useBlocker(isPopNavigationBlocked)
  const [exitStatus, setExitStatus] = useState(EXIT_STATUS.IDLE)
  const [exitErrorCode, setExitErrorCode] = useState(null)

  // navigate는 렌더마다 참조가 달라질 수 있다. 아래 컨트롤러들은 ref가 소유하므로 최신
  // navigate를 ref로 건네 준다(컨트롤러를 다시 만들지 않기 위해서다 — 다시 만들면 pending을 잃는다).
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const mountedRef = useRef(true)
  /** 정리·이동을 한 번만 수행하기 위한 표식(중복 ACK·확인 응답이 겹쳐도 한 번이다). */
  const settledRef = useRef(false)
  const timerRef = useRef(null)
  /** 지금 응답을 기다리는 중인가. 상태(state)와 별개로 **동기적으로** 읽어야 중복 전송을 막는다. */
  const pendingRef = useRef(false)

  useEffect(() => () => {
    mountedRef.current = false
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const setStatus = useCallback((status, code = null) => {
    if (!mountedRef.current) return
    setExitStatus(status)
    setExitErrorCode(code)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  /** 실제 정리·이동. 어떤 근거로 도달했든 여기서 한 번만 일어난다. */
  const settle = useCallback(() => {
    if (settledRef.current) return
    settledRef.current = true
    pendingRef.current = false
    clearTimer()
    createSessionEndFinalizer({
      clearGame: () => useInGameStore.getState().clearGame(),
      clearRoom: () => useMatchingStore.getState().clearRoom(),
      navigate: (...args) => navigateRef.current(...args),
    })()
  }, [clearTimer])

  /**
   * leave 요청 하나를 만든다. 신원 가드는 전부 createLeaveGameSessionRequest가 소유한다 —
   * 그 가드에 걸린 늦은 ack는 finalize도 onFailure도 부르지 않으므로, 아래 timeout이 그
   * 요청을 "결과 미확정"으로 끝맺는다(성공으로 바꾸지 않는다).
   */
  const buildLeaveRequest = useCallback(() => createLeaveGameSessionRequest({
    getSocket,
    getCurrentGameId: () => useInGameStore.getState().gameId,
    // F-21(AC-05): 계정·소속도 함께 캡처한다 — gameId만 비교하면 A→B→A 계정 전환이나 같은
    // 판에 다시 들어온 새 소속 위로 옛 ack가 그대로 내려앉는다.
    getCurrentAccountId: () => useAuthStore.getState().user?.uuid ?? null,
    // 계정 **값**만으로는 A→B→A를 구별할 수 없다(uuid가 원래대로 돌아온다). 전이 횟수를
    // 함께 캡처해야 그 사이 오간 요청의 늦은 ack를 걸러낼 수 있다.
    getIdentityGeneration: () => useAuthStore.getState().identityGeneration ?? null,
    getCurrentMembershipId: () => {
      const { state } = useInGameStore.getState()
      const me = useAuthStore.getState().user?.uuid ?? null
      if (!state || !me) return null
      return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
    },
    finalize: settle,
    onFailure: (response) => {
      if (!mountedRef.current) return
      pendingRef.current = false
      clearTimer()
      // 서버가 "못 했다"고 명시한 경우다. 이동은 0이고 재시도를 열어 둔다.
      setStatus(EXIT_STATUS.FAILED, response?.code ?? "UNKNOWN")
    },
  }), [clearTimer, setStatus, settle])

  /** 실제 전송 한 번. 확인 대화상자는 거치지 않는다(재시도가 다시 묻지 않게 한다). */
  const sendLeave = useCallback(() => {
    if (pendingRef.current || settledRef.current) return false
    const sent = buildLeaveRequest()()
    if (!sent) {
      // 미연결·게임 없음 — 아무것도 보내지 않았으므로 대기 상태로 두지 않는다.
      setStatus(EXIT_STATUS.FAILED, "OFFLINE")
      return false
    }
    pendingRef.current = true
    setStatus(EXIT_STATUS.PENDING)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!mountedRef.current || settledRef.current) return
      pendingRef.current = false
      // ACK 없음은 결과 **미확정**이다. 성공으로도 실패로도 단정하지 않는다.
      setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
    }, IN_GAME_EXIT_ACK_TIMEOUT_MS)
    return true
  }, [buildLeaveRequest, clearTimer, setStatus])

  const requestExit = useCallback(() => {
    // pending 동안의 추가 클릭·POP은 확인 대화상자조차 띄우지 않는다(전송 0).
    if (pendingRef.current || settledRef.current) return false
    return createExitConfirmController({
      confirm: window.confirm,
      requestLeave: sendLeave,
      // F-16(AC-01): native confirm에는 click 이벤트가 없으므로 호출마다 단일 actionId를
      // 발급한다(이벤트 없이 dispatchUiSfx 호출). 버튼 클릭·POP 두 진입점 모두 이 컨트롤러
      // 하나를 거치므로 각 진입당 정확히 한 번이다.
      onDecision: (kind) => dispatchUiSfx(kind),
    })()
  }, [sendLeave])

  /** 실패·미확정에서의 명시적 재시도. 서버의 멱등 성공이 곧 정리 근거가 된다. */
  const retryExit = useCallback(() => sendLeave(), [sendLeave])

  /**
   * 결과 미확정을 **권위 있게** 끝맺는다.
   *
   * 현재 연결·현재 신원으로 지금 이 게임의 스냅샷을 묻는다. 이 판에서 이미 빠졌다는 서버의
   * 답(FORFEITED_FROM_SESSION)만이 정리 근거다. 성공 스냅샷은 "아직 참여 중"이므로 재시도를
   * 열어 두고, SESSION_NOT_FOUND·INTERNAL_ERROR·전송 실패는 여전히 미확정으로 남긴다 —
   * 어느 것도 임의로 성공으로 바꾸지 않는다.
   */
  const resolveExitOutcome = useCallback(() => {
    if (settledRef.current || pendingRef.current) return false
    const socket = getSocket()
    const gameId = useInGameStore.getState().gameId
    if (!socket || socket.connected === false || !gameId) {
      setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
      return false
    }
    const requestedGameId = gameId
    const requestedAccountId = useAuthStore.getState().user?.uuid ?? null
    const requestedIdentityGeneration = useAuthStore.getState().identityGeneration ?? null
    const requestedSocketId = socket?.id ?? null

    socket.emit("get_session_snapshot", { gameId: requestedGameId }, (response) => {
      if (!mountedRef.current || settledRef.current) return
      // 옛 신원·옛 연결·다른 게임을 가리키는 응답은 이 화면의 근거가 아니다.
      if (useInGameStore.getState().gameId !== requestedGameId) return
      if ((useAuthStore.getState().user?.uuid ?? null) !== requestedAccountId) return
      if ((useAuthStore.getState().identityGeneration ?? null) !== requestedIdentityGeneration) return
      if (getSocket() !== socket) return
      if ((socket?.id ?? null) !== requestedSocketId) return

      if (response?.ok === false && response?.code === "FORFEITED_FROM_SESSION") {
        settle()
        return
      }
      if (response?.ok === true) {
        // 서버는 아직 나를 참가자로 본다 — 이탈은 실제로 이뤄지지 않았다.
        setStatus(EXIT_STATUS.FAILED, "STILL_PARTICIPATING")
        return
      }
      setStatus(EXIT_STATUS.UNRESOLVED, response?.code ?? "NO_ACK")
    })
    return true
  }, [setStatus, settle])

  useEffect(() => {
    if (blocker.state !== "blocked") return
    // 확인 여부와 무관하게 가로챈 POP 네비게이션 자체는 항상 취소한다 — 확인 시 실제 이동은
    // settle의 navigate(replace)가 별도로 수행하므로, blocker.proceed()로 원래 뒤로가기
    // 목적지(임의의 이전 화면)로 넘어가지 않게 한다.
    requestExit()
    blocker.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  return {
    requestExit,
    retryExit,
    resolveExitOutcome,
    exitStatus,
    exitErrorCode,
    isExitPending: exitStatus === EXIT_STATUS.PENDING,
    isExitUnresolved: exitStatus === EXIT_STATUS.UNRESOLVED,
  }
}

export { EXIT_STATUS as IN_GAME_EXIT_STATUS }
