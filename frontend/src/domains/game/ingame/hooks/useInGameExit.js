import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useBlocker, useNavigate } from "react-router-dom"
import { getSocket } from "@/shared/socket/socketClient.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import {
  getInGameIdentityScopeVersion,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
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

/** 지금 이 순간의 수신 범위. 요청 캡처와 응답 재확인이 **같은 함수**를 쓴다. */
function readExitScopeNow() {
  const auth = useAuthStore.getState()
  return readInGameReceiptScope({
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  })
}

/**
 * F-23(SPLIT-2): 요청에 **묶어 둔** 소속·연결 축이 아직 현재인가.
 *
 * 예전에는 이 판정을 effect가 갱신하는 ref(scopeKey)로 했다. 그런데 소속 전이는 store의
 * set에서 **동기적으로** 일어나고 effect는 그 뒤 렌더 커밋에서야 돈다 — 같은 배치 안에서
 * membership A→B→A가 지나간 직후 도착한 옛 성공 ACK는, ref가 아직 옛 값을 들고 있어 그대로
 * 통과해 현재 판을 정리해 버렸다(계정·소속 **값**은 원래대로 돌아와 있으므로 기존 값 비교도
 * 전부 통과한다). 그래서 기준을 요청 자체에 묶고, 응답 시점에 store가 소유한 **살아 있는**
 * 전이 세대와 직접 맞춘다 — effect가 언제 도는지와 무관해진다.
 */
function isExitRequestScopeCurrent(requestScope) {
  const now = readExitScopeNow()
  return now.membershipId === requestScope.membershipId
    && now.membershipEpoch === requestScope.membershipEpoch
    && now.socketEpoch === requestScope.socketEpoch
}

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
  /**
   * F-23(SPLIT-2): **시도마다 하나씩 발급하는 토큰.** 나가기 요청과 결과 확인 요청은 각자
   * pending·타이머·응답을 가지므로, "지금 화면이 기다리는 시도"를 하나의 단조 값으로 가른다.
   * 만료된 시도의 늦은 응답·타이머는 이 값이 달라 아무 상태도 바꾸지 못한다.
   */
  const requestTokenRef = useRef(0)
  /**
   * 화면이 읽는 **시도 번호**. ref와 같은 값을 상태로도 내보낸다 — 사용자가 접은 안내가
   * 어느 시도의 것이었는지를 화면이 알아야, 새 시도의 실패·미확정을 다시 띄울 수 있다
   * (InGamePage의 복구 안내 접기 참고).
   */
  const [exitAttemptId, setExitAttemptId] = useState(0)

  // F-23(SPLIT-2): 계정/소속 축의 전이 세대. 값이 원래대로 돌아오는 왕복(A→B→A)까지 드러난다.
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const scopeKey = `${identityScopeVersion}|${authUuid}|${identityGeneration}`
  const scopeKeyRef = useRef(scopeKey)

  useEffect(() => {
    // StrictMode의 setup→cleanup→setup은 같은 화면의 재설정이다 — mounted를 되돌려 준다.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      /**
       * F-23(AC-06 보수): **진행 중이던 요청을 여기서 만료시킨다.**
       *
       * 예전에는 cleanup이 mounted 표식과 타이머만 내렸다. 요청 토큰은 그대로여서, 화면이
       * 사라진 뒤 같은 신원·같은 게임·같은 소속으로 늦게 도착한 성공 ACK가
       * createLeaveGameSessionRequest의 신원 가드를 전부 통과하고 finalize까지 내려가
       * **이미 없는 화면**의 store 정리와 navigate를 실행했다. 토큰을 올려 두면 그 늦은
       * 응답·타이머는 "지금 화면이 기다리는 시도"가 아니므로 아무 상태도 바꾸지 못한다.
       *
       * pending도 함께 내린다 — StrictMode의 재설정처럼 같은 훅이 다시 살아나는 경우,
       * 만료된 시도의 pending이 남아 있으면 새 화면의 나가기가 영영 잠긴다.
       */
      requestTokenRef.current += 1
      pendingRef.current = false
    }
  }, [])

  const setStatus = useCallback((status, code = null) => {
    if (!mountedRef.current) return
    setExitStatus(status)
    setExitErrorCode(code)
  }, [])

  /**
   * 새 시도를 열거나(전송·확인 요청) 지금 시도를 만료시킨다(상한 초과·신원 전이).
   *
   * 토큰은 ref가 소유해 **동기적으로** 읽히고, 같은 값이 상태로도 흘러 화면이 시도를 구별한다.
   */
  const bumpAttempt = useCallback(() => {
    requestTokenRef.current += 1
    if (mountedRef.current) setExitAttemptId(requestTokenRef.current)
    return requestTokenRef.current
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  /** 실제 정리·이동. 어떤 근거로 도달했든 여기서 한 번만 일어난다. */
  const settle = useCallback(() => {
    // F-23(AC-06 보수): 화면이 없으면 정리할 화면도, 이동할 곳도 없다. 이 경계는 성공
    // ACK·권위 확인·중복 ACK가 **전부** 지나는 한 곳이라, 늦은 응답의 store 정리와 navigate를
    // 여기서 한 번에 막는다(각 호출부의 토큰·범위 검사와 겹쳐 두 겹으로 닫는다).
    if (!mountedRef.current) return
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
   * F-23(SPLIT-2): 신원 축이 바뀌면 **그 시도 자체를 만료**시킨다.
   *
   * 옛 시도의 타이머·pending·오류·잠금은 새 신원의 화면에 남지 않는다. settledRef도 함께
   * 되돌린다 — 정리가 끝난 뒤의 전이(clearGame이 만드는 전이)에서는 이미 이동이 끝났고, 옛
   * 요청의 늦은 ack는 createLeaveGameSessionRequest의 게임·계정·소속 가드가 따로 막는다.
   */
  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return
    scopeKeyRef.current = scopeKey
    bumpAttempt()
    clearTimer()
    pendingRef.current = false
    settledRef.current = false
    setStatus(EXIT_STATUS.IDLE)
  }, [scopeKey, bumpAttempt, clearTimer, setStatus])

  /**
   * leave 요청 하나를 만든다. 신원 가드는 전부 createLeaveGameSessionRequest가 소유한다 —
   * 그 가드에 걸린 늦은 ack는 finalize도 onFailure도 부르지 않으므로, 아래 timeout이 그
   * 요청을 "결과 미확정"으로 끝맺는다(성공으로 바꾸지 않는다).
   *
   * F-23(SPLIT-2): 그 위에 이 훅이 소유한 두 가지를 더 확인한다 — 이 시도가 아직 지금 화면이
   * 기다리는 시도인가(requestToken), 그리고 **요청에 묶어 둔** 소속·연결 축이 그 사이 전이하지
   * 않았는가(requestScope). 두 값 모두 요청 자체가 들고 있으므로 effect가 언제 도는지와
   * 무관하다. 기존 유틸을 대체하지 않고 그것이 통과시킨 응답에만 덧댄다.
   */
  const buildLeaveRequest = useCallback((requestToken, requestScope) => createLeaveGameSessionRequest({
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
    finalize: () => {
      // F-23(AC-06 보수): 실패 경로(onFailure)와 **같은 세 가지**를 본다. 예전에는 성공
      // 경로에만 mounted 검사가 없어서, 화면이 사라진 뒤 도착한 성공 ACK가 그대로 정리·이동을
      // 실행했다(cleanup이 토큰도 올리지 않았으므로 아래 토큰 검사도 통과했다).
      if (!mountedRef.current) return
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      settle()
    },
    onFailure: (response) => {
      if (!mountedRef.current) return
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      pendingRef.current = false
      clearTimer()
      // 서버가 "못 했다"고 명시한 경우다. 이동은 0이고 재시도를 열어 둔다.
      setStatus(EXIT_STATUS.FAILED, response?.code ?? "UNKNOWN")
    },
  }), [clearTimer, setStatus, settle])

  /**
   * 실제 전송 한 번. 확인 대화상자는 거치지 않는다(재시도가 다시 묻지 않게 한다).
   *
   * F-23(SPLIT-2): pending과 타이머를 **전송 전에** 건다. 서버가 같은 호출 스택에서 곧바로
   * ack를 주는 경우(동기 ACK), 전송 뒤에 pending을 켜면 이미 끝난 시도를 다시 "대기 중"으로
   * 덮어 화면이 영원히 진행 중으로 남는다.
   */
  const sendLeave = useCallback(() => {
    if (pendingRef.current || settledRef.current) return false
    const requestToken = bumpAttempt()
    // 요청에 묶는 소속·연결 축. 응답이 도착했을 때 이 값과 **그때의 살아 있는 값**을 맞춘다.
    const requestScope = readExitScopeNow()

    pendingRef.current = true
    setStatus(EXIT_STATUS.PENDING)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!mountedRef.current || settledRef.current) return
      // 만료된 시도의 타이머는 새 시도의 상태를 바꾸지 못한다.
      if (requestTokenRef.current !== requestToken) return
      if (!isExitRequestScopeCurrent(requestScope)) return
      pendingRef.current = false
      // ACK 없음은 결과 **미확정**이다. 성공으로도 실패로도 단정하지 않는다.
      setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
      // F-23(SPLIT-2): 상한을 넘긴 시도는 **여기서 만료된다.** 토큰을 올려 두지 않으면 그
      // 뒤에 도착한 늦은 ACK가 여전히 "지금 화면이 기다리는 시도"로 통과해, 이미 미확정으로
      // 끝맺은 화면을 성공(정리·이동)이나 실패로 뒤집는다. 미확정은 권위 확인으로만 끝난다.
      bumpAttempt()
    }, IN_GAME_EXIT_ACK_TIMEOUT_MS)

    let sent = false
    try {
      sent = buildLeaveRequest(requestToken, requestScope)()
    } catch {
      // 동기 전송 예외도 유한 복구 상태로 끝맺는다(대기로 남기지 않는다).
      sent = false
    }
    if (sent) return true
    // 미연결·게임 없음·전송 예외 — 아무것도 보내지 않았으므로 대기 상태로 두지 않는다.
    // 그 사이 동기 ack가 이미 이 시도를 끝냈다면(토큰이 넘어갔다면) 건드리지 않는다.
    if (requestTokenRef.current !== requestToken || settledRef.current) return false
    pendingRef.current = false
    clearTimer()
    setStatus(EXIT_STATUS.FAILED, "OFFLINE")
    return false
  }, [buildLeaveRequest, bumpAttempt, clearTimer, setStatus])

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
    const requestToken = bumpAttempt()
    const requestedGameId = gameId
    const requestedAccountId = useAuthStore.getState().user?.uuid ?? null
    const requestedIdentityGeneration = useAuthStore.getState().identityGeneration ?? null
    const requestedSocketId = socket?.id ?? null
    // F-23(SPLIT-2): 확인 응답에도 **소속**이 필요하다. 같은 판에서 이탈→재입장한 새 소속 위로
    // 옛 소속이 받은 FORFEITED_FROM_SESSION이 내려앉으면, 지금 참가 중인 판이 정리된다.
    const requestedScope = readInGameReceiptScope({
      accountId: requestedAccountId, identityGeneration: requestedIdentityGeneration,
    })

    /** 확인 요청도 유한 상한을 갖는다 — 응답이 없으면 미확정으로 끝맺고 다시 열어 둔다. */
    const isThisAttempt = () =>
      mountedRef.current
      && !settledRef.current
      && requestTokenRef.current === requestToken
      && isExitRequestScopeCurrent(requestedScope)

    pendingRef.current = true
    setStatus(EXIT_STATUS.PENDING)
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!isThisAttempt()) return
      pendingRef.current = false
      setStatus(EXIT_STATUS.UNRESOLVED, "NO_ACK")
      // 확인 요청도 상한을 넘기면 만료된다 — 늦게 도착한 확인 응답이 그 뒤의 화면을 바꾸지
      // 못하게 한다(다음 확인·재시도는 새 시도로 열린다).
      bumpAttempt()
    }, IN_GAME_EXIT_ACK_TIMEOUT_MS)

    let sent = false
    try {
      socket.emit("get_session_snapshot", { gameId: requestedGameId }, (response) => {
        if (!isThisAttempt()) return
        // 옛 신원·옛 연결·다른 게임·다른 소속을 가리키는 응답은 이 화면의 근거가 아니다.
        if (useInGameStore.getState().gameId !== requestedGameId) return
        if ((useAuthStore.getState().user?.uuid ?? null) !== requestedAccountId) return
        if ((useAuthStore.getState().identityGeneration ?? null) !== requestedIdentityGeneration) return
        if (getSocket() !== socket) return
        if ((socket?.id ?? null) !== requestedSocketId) return
        const now = readInGameReceiptScope({
          accountId: requestedAccountId, identityGeneration: requestedIdentityGeneration,
        })
        if (now.membershipId !== requestedScope.membershipId) return
        if (now.membershipEpoch !== requestedScope.membershipEpoch) return
        if (now.socketEpoch !== requestedScope.socketEpoch) return
        if (now.socketConnected !== requestedScope.socketConnected) return

        pendingRef.current = false
        clearTimer()
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
      sent = true
    } catch {
      sent = false
    }
    if (sent) return true
    if (!isThisAttempt()) return false
    pendingRef.current = false
    clearTimer()
    setStatus(EXIT_STATUS.UNRESOLVED, "OFFLINE")
    return false
  }, [bumpAttempt, clearTimer, setStatus, settle])

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
    // 이 안내가 **어느 시도의 것인가.** 화면이 접은 안내와 새 시도의 안내를 구별하는 값이다.
    exitAttemptId,
    isExitPending: exitStatus === EXIT_STATUS.PENDING,
    isExitUnresolved: exitStatus === EXIT_STATUS.UNRESOLVED,
  }
}

export { EXIT_STATUS as IN_GAME_EXIT_STATUS }
