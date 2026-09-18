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
 * @param {() => Promise<boolean>|boolean} [options.verifyMembership] - **서버에서** 현재 소속과
 *   참가자 목록을 다시 받아오는 실제 조회. UNKNOWN 뒤에는 이것이 성공해야만 새 확인을 시작할
 *   수 있다("결과를 모른다"는 상태에서 화면이 들고 있는 목록은 근거가 아니다).
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

/**
 * F-21(AC-04/AC-05): **상태를 바꾸는 그 자리에서** "이 응답이 아직 이 화면의 것인가"를 묻는다.
 *
 * 왜 이것이 별도 경계여야 하는가 — 서버 재확인(verifyMembership)은 응답을 받자마자 store를
 * 갈아끼운다(setRoom·applySessionSnapshot). 그 mutation은 **되돌릴 수 없다**: 이 훅이 나중에
 * `.then()`에서 세대를 비교해 "이 응답은 내 것이 아니었다"고 판정해도, store는 이미 옛 응답으로
 * 덮여 있고 더 나쁘게는 getMembershipScopeId()가 그 덮인 store에서 값을 읽으므로 비교 자체가
 * 오염된다. 그래서 판정 근거를 **보내기 전에 동기적으로 캡처**해 두고, mutation 직전에 묻는다.
 *
 * 묻는 네 가지는 각각 다른 사건을 잡는다:
 *   - identityGeneration — 로그아웃→재로그인(A→B→A). uuid는 원래대로 돌아오므로 값 비교로는
 *     잡히지 않고, **전이 횟수**만이 그 사이에 다른 계정이 있었다는 사실을 남긴다.
 *   - socket 객체 **와** socket.id — 객체 교체(새 연결)는 객체 비교로, 같은 객체의 재연결
 *     (Socket.IO는 객체를 유지하고 id만 새로 받는다)은 id 비교로만 잡힌다.
 *   - scopeId — 요청자 자신의 소속·방/판 인스턴스·서버 기동(호출부가 조립한다). 같은 방에
 *     다시 들어온 새 소속을 옛 확인이 자기 것으로 착각하지 않게 한다.
 *   - revision — 보낸 뒤 도착한 **더 새로운 사건**(퇴장·방장 승계·참여 종료). 위 세 값이 모두
 *     그대로여도 그 사이에 명단이 바뀌었으면 이 응답은 그보다 옛것이다.
 *
 * 하나라도 어긋나면 mutation을 하지 않고 검증을 **실패**로 돌린다 — 확인은 무효로 남고,
 * 새 확인을 열기 위해서는 성공한 재확인이 새로 필요하다(lookupResult의 잠금 계약).
 *
 * @param {object} options
 * @param {object} options.socket - emit에 쓴 그 소켓(객체 동일성까지 비교한다).
 * @param {() => string|null} options.getMembershipScopeId
 * @param {() => number|null} options.getRevision
 * @returns {() => boolean} mutation 직전에 **동기적으로** 부르는 판정 함수.
 */
export function captureVerificationGuard({ socket, getMembershipScopeId, getRevision }) {
  const readScopeId = () => (typeof getMembershipScopeId === "function" ? getMembershipScopeId() : null)
  const readRevision = () => (typeof getRevision === "function" ? getRevision() : null)

  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null
  const scopeId = readScopeId()
  const revision = readRevision()

  return function isStillCurrent() {
    // 캡처 자체가 불완전했으면 통과시키지 않는다(fail-closed).
    if (!authUuid || !socketId || !scopeId) return false
    if (!Number.isInteger(revision)) return false

    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    if (socket.id !== socketId) return false
    if (readScopeId() !== scopeId) return false
    if (readRevision() !== revision) return false
    return true
  }
}

/**
 * F-21(AC-04/AC-05): **ACK를 받은 그 자리에서** "이 응답이 아직 이 요청의 것인가"를 묻는다.
 *
 * captureVerificationGuard와 묻는 것은 같지만 쓰이는 자리가 다르다 — 저쪽은 store를 덮어쓰는
 * 서버 재확인의 경계이고, 이쪽은 **소켓 ACK 콜백**의 경계다. 예전에는 ACK 콜백이 계정 uuid도
 * socket.id도 묻지 않고 계정 세대·요청 세대·소켓 객체·scopeId만 봤다. 그 네 값으로는 다음 두
 * 가지가 그대로 통과한다:
 *
 *   - **같은 Socket 객체의 재연결.** Socket.IO는 재연결에서 객체를 유지하고 id만 새로 받는다.
 *     끊긴 사이에 보낸 요청의 ACK가 새 연결의 화면에서 상태와 잠금을 바꿨다.
 *   - **A→B→A 계정 전환이 한 번에 처리된 경우.** uuid는 제자리로 돌아오므로 값 비교로는 잡히지
 *     않는다 — identityGeneration(전이 횟수)만이 그 사이에 다른 계정이 있었다는 사실을 남긴다.
 *     계정 세대(generationRef)는 authUuid가 **바뀌어 보일 때만** effect로 오르므로 A→B→A가
 *     같은 렌더 배치로 합쳐지면 한 번도 오르지 않을 수 있다.
 *
 * 어긋나면 호출부는 **아무 것도 하지 않는다** — 상태도, 잠금도 건드리지 않는다. 그 요청의
 * 결과를 여전히 모르기 때문이다(잠금을 푸는 것은 결과를 알게 됐다는 뜻이다).
 */
function captureAckGuard({ socket, scopeId, requestGeneration, generation, refs, getMembershipScopeId }) {
  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null

  return function isStillCurrent() {
    if (!refs.mountedRef.current) return false
    if (generation !== refs.generationRef.current) return false
    if (requestGeneration !== refs.requestGenerationRef.current) return false
    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    // 캡처 시점에 id가 없었으면 판정할 근거 자체가 없다(fail-closed).
    if (socketId === null || socket.id !== socketId) return false
    if (scopeId !== getMembershipScopeId()) return false
    return true
  }
}

let requestSeq = 0
function nextRequestId() {
  requestSeq += 1
  // 시각·난수를 섞지 않는다 — 같은 화면이 같은 요청을 재조회할 때 키가 달라지면 안 된다.
  // 프로세스 안에서만 고유하면 충분하다(서버 키에는 bootEpoch와 인증 uuid가 함께 들어간다).
  return `kick-${requestSeq}-${Math.random().toString(36).slice(2, 10)}`
}

export function useKickPlayerRequest({
  scope,
  buildRequest,
  getMembershipScopeId = () => null,
  verifyMembership = null,
}) {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const [pendingTarget, setPendingTarget] = useState(null)
  const [status, setStatus] = useState(KICK_REQUEST_STATUS.IDLE)
  const [errorCode, setErrorCode] = useState(null)
  /**
   * UNKNOWN 이후 "서버에서 현재 소속을 다시 확인하기 전"인가. 참인 동안은 새 확인을 열 수
   * 없다 — 결과를 모르는 요청이 남아 있는데 화면이 들고 있는 목록만 보고 두 번째 추방을
   * 지목하게 두면, 이미 실행된 추방을 사용자가 다시 시도하게 된다.
   */
  const [needsVerification, setNeedsVerification] = useState(false)
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
  /**
   * **전송 잠금.** 이전에는 statusRef(=렌더 시점의 status 거울)만 봤다. status는 setState로
   * 바뀌고 statusRef는 **다음 렌더에서야** 갱신되므로, 같은 렌더 안에서 confirmKick을 두 번
   * 부르면 두 호출 모두 이전 값을 읽고 서로 다른 requestId의 추방을 **둘 다** 보냈다.
   *
   * 그래서 emit **직전에 동기적으로** 잠근다. 푸는 것은 그 요청의 결과를 실제로 알게 됐을
   * 때뿐이다 — ACK가 도착했거나, 결과 조회가 답을 돌려줬거나, 계정이 바뀌었을 때.
   * reset()(안내 닫기·모달 닫기)은 **풀지 않는다**: 미확인 전송이 남아 있는데 모달을 닫았다
   * 다시 여는 것만으로 두 번째 추방이 나가서는 안 된다.
   */
  const sendLockRef = useRef(false)
  // status의 현재 값을 렌더 밖(콜백·수신기)에서 읽기 위한 거울. 상태 자체는 위 useState가
  // 소유하고, 이 ref는 판정에만 쓴다. 전이 시점에도 **동기적으로** 맞춰 둔다.
  const statusRef = useRef(KICK_REQUEST_STATUS.IDLE)
  statusRef.current = status
  /** 검증 대기 여부의 동기 거울(위 needsVerification과 같은 이유). */
  const needsVerificationRef = useRef(false)

  /** 상태 전이의 단일 경계 — state와 거울을 항상 함께 옮긴다. */
  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  /**
   * F-21(AC-04): **결과를 알게 된 그 순간** 재확인 요구를 해소한다.
   *
   * 재확인 요구는 "이 요청이 실행됐는지 모른다"에서만 생긴다(UNKNOWN). 그러므로 그 요청의
   * 결과가 **확정으로** 돌아오면 — 실행됐다(KICKED)든, 실행되지 않았다는 기록된 거부의
   * 재생이든 — 요구의 근거 자체가 사라진다. 이 해소가 없으면 다음이 영구 교착이 된다:
   *
   *   조회① UNKNOWN → 재확인 시작(요청 세대 G) → 조회②가 KICKED를 확정(요청 세대 G+1)
   *   → 뒤늦게 끝난 재확인①은 **옳게** 폐기되지만(세대 불일치) 아무도 요구를 내리지 않는다
   *   → requestConfirm이 needsVerification으로 영영 막힌다.
   *
   * 해소는 **확정된 결과**에서만 한다 — 조회 자체의 실패(STALE_SOCKET 등)는 원 요청에 대해
   * 아무 것도 말하지 않으므로 여기에 오지 않는다. 신원·연결·소속·요청 세대 검사를 통과한
   * 호출부에서만 부른다(옛 응답이 현재 요구를 내리지 못한다).
   */
  const settleVerification = useCallback(() => {
    needsVerificationRef.current = false
    setNeedsVerification(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 계정이 바뀌면 진행 중인 확인·결과는 전부 이 화면의 것이 아니다.
  useEffect(() => {
    generationRef.current += 1
    requestGenerationRef.current += 1
    lastReceiptRef.current = null
    // 계정이 바뀌면 그 전송은 더 이상 이 화면의 책임이 아니다 — 잠금도 함께 끊는다.
    sendLockRef.current = false
    needsVerificationRef.current = false
    setNeedsVerification(false)
    setHasReceipt(false)
    setPendingTarget(null)
    applyStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [authUuid, applyStatus])

  /** 확인 단계로 들어간다. 소켓 요청은 일어나지 않는다. */
  const requestConfirm = useCallback((target) => {
    if (!target || typeof target.uuid !== "string" || !target.uuid) return
    if (typeof target.membershipId !== "string" || !target.membershipId) return
    // 결과를 모르는 전송이 남아 있으면 새 확인을 열지 않는다. 판정은 **잠금**으로 한다 —
    // status만 보면 안내를 닫은 뒤(IDLE) 미확인 요청이 그대로 남은 상태를 통과시킨다.
    if (sendLockRef.current) return
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return
    // UNKNOWN 뒤에는 서버 재확인이 성공해야만 새 확인을 연다.
    if (needsVerificationRef.current) return
    setPendingTarget({
      uuid: target.uuid,
      membershipId: target.membershipId,
      nickname: typeof target.nickname === "string" ? target.nickname : "",
      // 확인을 연 순간 이 화면이 붙어 있던 방/게임. 여기가 바뀌면 확인은 무효다.
      scopeId: getMembershipScopeId(),
    })
    setErrorCode(null)
    applyStatus(KICK_REQUEST_STATUS.CONFIRMING)
  }, [getMembershipScopeId, applyStatus])

  /** 확인을 취소한다. 어떤 요청도 보내지 않고 어떤 결과도 남기지 않는다. */
  const cancelConfirm = useCallback(() => {
    setPendingTarget(null)
    if (statusRef.current === KICK_REQUEST_STATUS.CONFIRMING) applyStatus(KICK_REQUEST_STATUS.IDLE)
  }, [applyStatus])

  /**
   * 확인된 대상을 실제로 추방한다. 여기서만 소켓 요청이 일어난다.
   *
   * @param {object[]} [currentTargets] - 화면이 지금 보고 있는 목록. 확인 당시의 소속이
   *   그대로 남아 있는지 여기서 다시 대조한다.
   */
  const confirmKick = useCallback((currentTargets = null) => {
    const target = pendingTarget
    if (!target) return
    // **가장 먼저** 잠금을 본다. 같은 렌더 안의 두 번째 호출은 여기서 끝난다.
    if (sendLockRef.current) return
    if (statusRef.current === KICK_REQUEST_STATUS.SENDING) return

    const fail = (code) => {
      setPendingTarget(null)
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(code)
    }

    // 확인 당시의 방/게임과 지금이 같은가.
    if (target.scopeId !== getMembershipScopeId()) {
      fail("STALE_MEMBERSHIP")
      return
    }
    // 확인 당시의 **소속**이 그대로인가. 같은 uuid로 다시 들어온 새 소속은 다른 사람이다.
    if (Array.isArray(currentTargets)) {
      const seated = currentTargets.find((entry) => entry?.uuid === target.uuid)
      if (!seated || seated.membershipId !== target.membershipId) {
        fail("STALE_MEMBERSHIP")
        return
      }
    }

    const socket = getSocket()
    if (!socket) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }

    const requestId = nextRequestId()
    const request = buildRequest({ target, requestId })
    if (!request) {
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_READY")
      return
    }

    // ── 여기서부터 되돌릴 수 없다 ──────────────────────────────────────────────
    // 잠금과 영수증 키를 emit **이전에·동기적으로** 확정한다. 이 사이에는 어떤 await도,
    // 어떤 setState 경유 판정도 없다 — 그래야 같은 렌더의 두 번째 호출이 반드시 막힌다.
    sendLockRef.current = true
    // 영수증 키는 요청을 보내기 전에 남긴다 — ACK를 못 받아도 이 키로 결과를 물을 수
    // 있어야 한다. bootEpoch는 서버가 준 값을 그대로 되돌려보낸다.
    lastReceiptRef.current = { bootEpoch: request.bootEpoch, requestId, socket }
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    const scopeId = target.scopeId
    statusRef.current = KICK_REQUEST_STATUS.SENDING
    setHasReceipt(true)
    setStatus(KICK_REQUEST_STATUS.SENDING)
    setErrorCode(null)

    // 계정 신원(uuid·전이 세대)·소켓 객체·socket.id·소속·요청 세대를 **emit 이전에** 캡처한다.
    const isStillCurrent = captureAckGuard({
      socket,
      scopeId,
      requestGeneration,
      generation,
      refs: { mountedRef, generationRef, requestGenerationRef },
      getMembershipScopeId,
    })

    socket.emit(scope === "GAME" ? KICK_EVENTS.GAME : KICK_EVENTS.ROOM, request, (response) => {
      // 계정 신원·연결(객체와 id)·소속·요청 세대가 그 사이 바뀌었으면 이 응답은 현재 화면의
      // 것이 아니다. 잠금도 풀지 않는다 — 이 요청의 결과를 **여전히 모르기** 때문이다.
      if (!isStillCurrent()) return

      // 답을 받았다 — 이 전송은 끝났다.
      sendLockRef.current = false
      setPendingTarget(null)
      if (response && response.ok === true) {
        applyStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        return
      }
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
    })
  }, [pendingTarget, buildRequest, getMembershipScopeId, scope, applyStatus])

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
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode("NOT_CONNECTED")
      return
    }
    const generation = generationRef.current
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    // 조회도 **그 화면의 것**이다. 조회를 보낸 뒤 방/게임을 옮기면 그 답은 지금 화면의
    // pendingTarget·상태를 건드려서는 안 된다(전송 경로와 같은 계약이었는데 빠져 있었다).
    const scopeId = getMembershipScopeId()
    // 전송 경로와 **같은** 신원 경계다(계정 uuid·전이 세대·소켓 객체·socket.id 포함).
    const isStillCurrent = captureAckGuard({
      socket,
      scopeId,
      requestGeneration,
      generation,
      refs: { mountedRef, generationRef, requestGenerationRef },
      getMembershipScopeId,
    })

    socket.emit(KICK_EVENTS.RESULT, { bootEpoch: receipt.bootEpoch, requestId: receipt.requestId }, (response) => {
      // 이 조회를 보낸 뒤에 새 요청·새 조회가 시작됐거나 계정·연결이 바뀌었다면 이 응답은
      // 지난 요청의 것이다 — 진행 중인 전송을 남의 결과로 덮지 않는다.
      if (!isStillCurrent()) return

      /**
       * **조회가 실패한 것과 결과가 거부로 확정된 것은 다르다.**
       *
       * 서버의 결과 조회 응답은 세 종류다:
       *   - `{ok:true, status:'KICKED'|'UNKNOWN'}` — 서버가 답한 **결과**다.
       *   - `{ok:false, replayed:true, code}` — 기록된 **확정 거부**의 재생이다(그 요청은
       *     실행되지 않았다는 역사적 사실).
       *   - `{ok:false}` (replayed 없음) — 조회 자체가 실패했다(STALE_SOCKET·잘못된 입력 등).
       *     원 추방의 결과에 대해서는 **아무 것도 알려주지 않는다.**
       *
       * 마지막 경우에 잠금을 풀면, 실행됐을지도 모르는 요청이 미확정으로 남아 있는데 화면이
       * 새 추방을 지목할 수 있게 된다. 그래서 여기서는 잠금도 확인도 건드리지 않고 실패만
       * 표시한다 — 영수증 키는 그대로 남으므로 같은 키로 다시 조회해 회복할 수 있다.
       */
      const decided = response?.ok === true || response?.replayed === true
      if (!decided) {
        applyStatus(KICK_REQUEST_STATUS.FAILED)
        setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
        return
      }

      // 결과가 확정됐든 알 수 없든, 그 답을 받은 순간 옛 확인은 끝난 것이다. 확인을 남겨
      // 두면 ACK를 놓친 요청의 대상에게 **새 requestId로** 두 번째 추방이 나갈 수 있다 —
      // UNKNOWN의 올바른 다음 행동은 지금 목록에서 대상을 다시 확인하는 것이다.
      //
      // 그 답이 곧 "이 전송의 결과를 알게 됐다"이므로 잠금도 여기서 푼다.
      sendLockRef.current = false
      setPendingTarget(null)
      if (response && response.ok === true && response.status === "KICKED") {
        applyStatus(KICK_REQUEST_STATUS.SUCCEEDED)
        setErrorCode(null)
        // 이 영수증의 결과를 알게 됐다 — 앞선 UNKNOWN이 걸어 둔 재확인 요구도 함께 내린다.
        settleVerification()
        return
      }
      if (response && response.ok === true && response.status === "UNKNOWN") {
        applyStatus(KICK_REQUEST_STATUS.UNKNOWN)
        setErrorCode(null)
        // ── UNKNOWN의 실제 다음 행동 ────────────────────────────────────────
        // 상태만 바꾸고 끝내면 "목록을 다시 확인하라"는 안내문만 남고 아무도 다시 확인하지
        // 않는다. 서버에서 현재 소속·참가자 목록을 **실제로** 다시 받아오고, 그것이 성공할
        // 때까지 새 확인을 잠근다. 자동 재전송은 하지 않는다 — 이미 실행됐을 수 있는
        // 추방을 화면이 대신 되풀이해서는 안 된다.
        if (typeof verifyMembership !== "function") return
        needsVerificationRef.current = true
        setNeedsVerification(true)
        /**
         * 재확인의 완료도 **그 조회의 것**이다. 예전에는 계정 세대만 봤다 — 재확인 A가 도는
         * 사이에 새 추방 B가 나가고 그 B도 UNKNOWN이 되면, 뒤늦게 끝난 A의 완료가 B를 위해
         * 걸어 둔 잠금을 풀어 버린다(결과를 모르는 B가 남았는데 새 확인이 열린다).
         * 이 조회가 시작할 때 올린 **요청 세대**가 그 둘을 구별하는 유일한 값이다.
         */
        const isVerificationStillCurrent = captureAckGuard({
          socket,
          scopeId,
          requestGeneration,
          generation,
          refs: { mountedRef, generationRef, requestGenerationRef },
          getMembershipScopeId,
        })
        // **동기적으로** 시작한다 — 마이크로태스크로 미루면 "UNKNOWN이면 서버에서 다시
        // 확인한다"가 같은 턴 안에서 관측되지 않는다(그 사이 화면이 바뀌면 영영 안 일어난다).
        let verification
        try {
          verification = verifyMembership()
        } catch {
          return // 재확인을 시작조차 못 했다 — 잠긴 채로 둔다.
        }
        Promise.resolve(verification)
          .then((ok) => {
            if (!isVerificationStillCurrent()) return
            if (ok === false) return // 실패하면 잠긴 채로 둔다 — 사용자가 다시 시도한다.
            needsVerificationRef.current = false
            setNeedsVerification(false)
          })
          .catch(() => { /* 재확인 실패는 잠금을 유지한다(모르는 상태를 풀지 않는다) */ })
        return
      }
      // 기록된 **확정 거부**의 재생(replayed:true) — "그 요청은 실행되지 않았다"는 역사적
      // 사실이므로 이것도 결과를 알게 된 것이다. 앞선 UNKNOWN의 재확인 요구를 내린다.
      applyStatus(KICK_REQUEST_STATUS.FAILED)
      setErrorCode(typeof response?.code === "string" ? response.code : "UNKNOWN_ERROR")
      settleVerification()
    })
  }, [applyStatus, getMembershipScopeId, verifyMembership, settleVerification])

  /**
   * 안내를 닫는다(상태만 초기화 — 서버 기록은 그대로다. 재조회 키도 남겨 둔다).
   *
   * 요청 세대는 올린다 — 닫은 뒤에 도착한 옛 ACK가 이미 정리된 안내를 되살리지 않게 한다.
   *
   * **전송 잠금은 풀지 않는다.** 모달을 닫았다 여는 것은 "결과를 알게 됐다"가 아니다 —
   * 풀어 주면 ACK를 놓친 요청이 미확인인 채로 두 번째 추방이 나갈 수 있다(닫기·열기만으로
   * 우회되는 잠금은 잠금이 아니다). 같은 이유로 UNKNOWN 이후의 재확인 요구도 남긴다.
   */
  const reset = useCallback(() => {
    requestGenerationRef.current += 1
    setPendingTarget(null)
    applyStatus(KICK_REQUEST_STATUS.IDLE)
    setErrorCode(null)
  }, [applyStatus])

  return {
    pendingTarget,
    status,
    errorCode,
    isSending: status === KICK_REQUEST_STATUS.SENDING,
    canLookupResult: hasReceipt,
    /** 결과를 모르는 전송이 남아 새 확인을 열 수 없는가(화면이 안내에 쓴다). */
    isAwaitingResolution: needsVerification,
    requestConfirm,
    cancelConfirm,
    confirmKick,
    lookupResult,
    reset,
  }
}
