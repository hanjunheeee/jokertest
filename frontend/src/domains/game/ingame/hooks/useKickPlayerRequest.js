import { useCallback, useEffect, useRef, useState } from "react"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대상이고, `@/` 별칭은
// vite만 해석할 수 있어 그 실행을 막는다(useGameSessionSocketEvents와 같은 관례).
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"

/**
 * F-21(AC-02/AC-04): 대기방과 진행 중 화면이 **함께 쓰는** 추방 요청 수명 관리.
 *
 * 두 화면이 각자 확인·전송·실패·재조회 상태를 적어 두면 한쪽만 고쳐져 조용히 갈라진다.
 * 그래서 이 훅이 단 하나의 상태 기계를 소유하고, 화면은 "무엇을 지목했는가"와 "어떤 명령을
 * 쓰는가"만 넘긴다.
 *
 * ── 지켜야 하는 것 ─────────────────────────────────────────────────────────────
 *
 * 1. **확인 취소는 소켓 요청 0회다.** 확인 단계는 순수 로컬 상태이고, 전송은 confirm에서만
 *    일어난다.
 * 2. **확인 당시의 소속이 바뀌면 그 확인은 무효다.** 대상이 나갔다가 다시 들어오면 목록의
 *    membershipId가 달라진다 — 옛 확인으로 새 소속을 추방하지 않는다(서버도 같은 이유로
 *    STALE_MEMBERSHIP으로 거부하지만, 화면이 먼저 확인 절차를 다시 요구해야 한다).
 * 3. **timeout·disconnect를 성공으로 표시하지 않는다.** ACK를 받지 못하면 결과는 미확인이고,
 *    사용자가 명시적으로 "결과 확인"을 눌렀을 때만 기존 키를 **조회**한다(새 추방을 다시
 *    보내지 않는다). UNKNOWN이면 목록을 다시 받아 새 확인 절차부터 시작한다.
 * 4. **계정·연결·소속·요청 세대가 다른 응답은 현재 화면을 바꾸지 않는다.** 응답이 돌아오는
 *    사이 로그아웃·재로그인·방 이동이 일어날 수 있다.
 *
 * @param {object} options
 * @param {'ROOM'|'GAME'} options.scope - 어느 명령을 쓸지. 이벤트 이름만 달라진다.
 * @param {() => (object|null)} options.buildRequest - 확인된 대상으로 서버 payload를 만든다.
 *   현재 방/게임 식별자와 요청자 소속을 아는 것은 화면이므로 그쪽이 소유한다. null이면 보낼
 *   수 없는 상태라는 뜻이다(요청 0회).
 * @param {() => string|null} [options.getMembershipScopeId] - 지금 이 화면이 붙어 있는
 *   방/게임 식별자. 값이 바뀌면 진행 중인 확인과 결과가 이 화면의 것이 아니게 된다.
 */
export const KICK_EVENTS = Object.freeze({
  ROOM: "kick_room_player",
  GAME: "kick_game_player",
  RESULT: "get_kick_result",
})

/** 요청 상태. UNKNOWN은 "성공도 미실행도 아니다"라는 뜻이며 성공으로 승격되지 않는다. */
export const KICK_REQUEST_STATUS = Object.freeze({
  IDLE: "IDLE",
  CONFIRMING: "CONFIRMING",
  SENDING: "SENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
})

let requestSeq = 0
function nextRequestId() {
  requestSeq += 1
  // 시각·난수를 섞지 않는다 — 같은 화면이 같은 요청을 재조회할 때 키가 달라지면 안 된다.
  // 프로세스 안에서만 고유하면 충분하다(서버 키에는 bootEpoch와 인증 uuid가 함께 들어간다).
  return `kick-${requestSeq}-${Math.random().toString(36).slice(2, 10)}`
}

export function useKickPlayerRequest({ scope, buildRequest, getMembershipScopeId = () => null }) {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const [pendingTarget, setPendingTarget] = useState(null)
  const [status, setStatus] = useState(KICK_REQUEST_STATUS.IDLE)
  const [errorCode, setErrorCode] = useState(null)
  // "재조회할 키가 있는가"는 화면에 버튼을 띄우는 근거라 state여야 한다(ref는 리렌더를
  // 일으키지 않아 ACK를 놓친 화면에 결과 확인 버튼이 끝내 나타나지 않는다).
  const [hasReceipt, setHasReceipt] = useState(false)

  // 응답이 돌아왔을 때 "이 응답이 아직 내 것인가"를 판정하는 세대들이다. 렌더 시점 클로저를
  // 캡처하지 않고 호출 시점에 다시 읽는다(전역 소켓 수신기들과 같은 이유).
  const generationRef = useRef(0)
  /**
   * **요청 세대.** 계정 세대(generationRef)만으로는 부족하다 — 같은 계정·같은 연결·같은 방
   * 안에서도 요청은 여러 번 오간다. 결과 조회를 보내 놓고 응답 전에 새 추방을 보내면, 뒤늦게
   * 도착한 옛 조회의 ACK가 진행 중인 SENDING을 SUCCEEDED/FAILED로 덮어써 화면이 다른 요청의
   * 결과를 말하게 되고, SENDING이 풀린 틈에 같은 대상에게 두 번째 요청까지 나갈 수 있다.
   * 전송·조회를 시작할 때마다 올리고, 응답은 자기 세대일 때만 화면을 바꾼다.
   */
  const requestGenerationRef = useRef(0)
  const lastReceiptRef = useRef(null)
  const mountedRef = useRef(true)
  // status의 현재 값을 렌더 밖(콜백·수신기)에서 읽기 위한 거울. 상태 자체는 위 useState가
  // 소유하고, 이 ref는 판정에만 쓴다.
  const statusRef = useRef(KICK_REQUEST_STATUS.IDLE)
  statusRef.current = status

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 계정이 바뀌면 진행 중인 확인·결과는 전부 이 화면의 것이 아니다.
  useEffect(() => {
    generationRef.current += 1
    requestGenerationRef.current += 1
    lastReceiptRef.current = null
    setHasReceipt(false)
    setPendingTarget(null)
    setStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [authUuid])

  /** 확인 단계로 들어간다. 소켓 요청은 일어나지 않는다. */
  const requestConfirm = useCallback((target) => {
    if (!target || typeof target.uuid !== "string" || !target.uuid) return
    if (typeof target.membershipId !== "string" || !target.membershipId) return
    // 이미 보내는 중이면 새 확인을 받지 않는다 — 연속 클릭이 두 번째 요청을 만들지 않게 한다.
    // 판정은 ref로 한다(setState 갱신 함수 안에서 다른 setState를 부르면 StrictMode의 이중
    // 호출이 그대로 부수효과 두 번이 된다).
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return
    setPendingTarget({
      uuid: target.uuid,
      membershipId: target.membershipId,
      nickname: typeof target.nickname === "string" ? target.nickname : "",
      // 확인을 연 순간 이 화면이 붙어 있던 방/게임. 여기가 바뀌면 확인은 무효다.
      scopeId: getMembershipScopeId(),
    })
    setErrorCode(null)
    setStatus(KICK_REQUEST_STATUS.CONFIRMING)
  }, [getMembershipScopeId])

  /** 확인을 취소한다. 어떤 요청도 보내지 않고 어떤 결과도 남기지 않는다. */
  const cancelConfirm = useCallback(() => {
    setPendingTarget(null)
    setStatus((currentStatus) =>
      currentStatus === KICK_REQUEST_STATUS.CONFIRMING ? KICK_REQUEST_STATUS.IDLE : currentStatus)
  }, [])

  /**
   * 확인된 대상을 실제로 추방한다. 여기서만 소켓 요청이 일어난다.
   *
   * @param {object[]} [currentTargets] - 화면이 지금 보고 있는 목록. 확인 당시의 소속이
   *   그대로 남아 있는지 여기서 다시 대조한다.
   */
  const confirmKick = useCallback((currentTargets = null) => {
    const target = pendingTarget
    if (!target) return
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return

    // 확인 당시의 방/게임과 지금이 같은가.
    if (target.scopeId !== getMembershipScopeId()) {
      setPendingTarget(null)
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("STALE_MEMBERSHIP")
      return
    }
    // 확인 당시의 **소속**이 그대로인가. 같은 uuid로 다시 들어온 새 소속은 다른 사람이다.
    if (Array.isArray(currentTargets)) {
      const seated = currentTargets.find((entry) => entry?.uuid === target.uuid)
      if (!seated || seated.membershipId !== target.membershipId) {
        setPendingTarget(null)
        setStatus(KICK_REQUEST_STATUS.FAILED)
        setErrorCode("STALE_MEMBERSHIP")
        return
      }
    }

    const socket = getSocket()
    if (!socket) {
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }

    const requestId = nextRequestId()
    const request = buildRequest({ target, requestId })
    if (!request) {
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_READY")
      return
    }

    // 영수증 키는 **요청을 보내기 전에** 남긴다 — ACK를 못 받아도 이 키로 결과를 물을 수
    // 있어야 한다. bootEpoch는 서버가 준 값을 그대로 되돌려보낸다.
    lastReceiptRef.current = { bootEpoch: request.bootEpoch, requestId, socket }
    setHasReceipt(true)
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    const scopeId = target.scopeId
    setStatus(KICK_REQUEST_STATUS.SENDING)
    setErrorCode(null)

    socket.emit(scope === "GAME" ? KICK_EVENTS.GAME : KICK_EVENTS.ROOM, request, (response) => {
      // 계정·연결·소속·요청 세대가 그 사이 바뀌었으면 이 응답은 현재 화면의 것이 아니다.
      if (!mountedRef.current) return
      if (generation !== generationRef.current) return
      if (requestGeneration !== requestGenerationRef.current) return
      if (getSocket() !== socket) return
      if (scopeId !== getMembershipScopeId()) return

      setPendingTarget(null)
      if (response && response.ok === true) {
        setStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        return
      }
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
    })
  }, [pendingTarget, buildRequest, getMembershipScopeId, scope])

  /**
   * ACK를 놓쳤을 때 **기존 키**의 결과만 다시 묻는다. 새 추방을 보내지 않는다.
   * 서버가 UNKNOWN을 돌려주면 성공으로 승격하지 않고 그대로 UNKNOWN으로 표시한다 —
   * 그 상태의 올바른 다음 행동은 목록을 다시 받아 새 확인 절차를 밟는 것이다.
   */
  const lookupResult = useCallback(() => {
    const receipt = lastReceiptRef.current
    if (!receipt) return
    const socket = getSocket()
    if (!socket) {
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    socket.emit(KICK_EVENTS.RESULT, { bootEpoch: receipt.bootEpoch, requestId: receipt.requestId }, (response) => {
      if (!mountedRef.current) return
      if (generation !== generationRef.current) return
      // 이 조회를 보낸 뒤에 새 요청·새 조회가 시작됐다면 이 응답은 지난 요청의 것이다 —
      // 진행 중인 전송을 남의 결과로 덮지 않는다.
      if (requestGeneration !== requestGenerationRef.current) return
      if (getSocket() !== socket) return

      // 결과가 확정됐든 알 수 없든, 그 답을 받은 순간 옛 확인은 끝난 것이다. 확인을 남겨
      // 두면 ACK를 놓친 요청의 대상에게 **새 requestId로** 두 번째 추방이 나갈 수 있다 —
      // UNKNOWN의 올바른 다음 행동은 지금 목록에서 대상을 다시 확인하는 것이다.
      setPendingTarget(null)
      if (response && response.ok === true && response.status === "KICKED") {
        setStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        return
      }
      if (response && response.ok === true && response.status === "UNKNOWN") {
        setStatus(KICK_REQUEST_STATUS.UNKNOWN)
        setErrorCode(null)
        return
      }
      setStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
    })
  }, [])

  /**
   * 안내를 닫는다(상태만 초기화 — 서버 기록은 그대로다. 재조회 키도 남겨 둔다).
   *
   * 요청 세대는 올린다 — 닫은 뒤에 도착한 옛 ACK가 이미 정리된 안내를 되살리지 않게 한다.
   */
  const reset = useCallback(() => {
    requestGenerationRef.current += 1
    setPendingTarget(null)
    setStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [])

  return {
    pendingTarget,
    status,
    errorCode,
    isSending: status === KICK_REQUEST_STATUS.SENDING,
    canLookupResult: hasReceipt,
    requestConfirm,
    cancelConfirm,
    confirmKick,
    lookupResult,
    reset,
  }
}
