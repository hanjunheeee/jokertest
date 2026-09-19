import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { isStaleSessionSnapshotAckResponse } from "../utils/isStaleSessionSnapshotAckResponse.js"

const SESSION_SNAPSHOT_TIMEOUT_MS = 5000

// ───────────────────────────────────────────────────────────────────────────
// F-23(SPLIT-1): **신원 재결속이 진행 중인가**
//
// 신원(계정·소속)이나 연결이 바뀌면 지금 화면이 들고 있는 state는 아직 **이전 신원이 받아
// 둔 사실**이다. 그 구간에는 표시 상태들이 각자 조심스럽게 자기를 접는데(사망 연출 큐는
// scope가 달라지는 즉시 버려진다), 정작 결과 화면 이동은 잔존 ENDED만 보고 그대로 넘어갈 수
// 있다 — 그러면 새 연결에서 복구될 연출이 통째로 잘린 채 화면이 떠난다.
//
// 그래서 이 훅이 "현재 신원의 스냅샷을 다시 묻는 중"이라는 사실을 한 값으로 내보낸다. 이
// 값은 **유한하다** — 요청은 5초 상한을 갖고, 성공·실패·거부 어느 경로로 끝나도 같은 자리에서
// 내려간다(무한 보류가 생기지 않는다). 요청이 실제로 나갈 수 있는 순간(연결됨)에만 올린다.
//
// 반환 문자열(bootstrapStatus)은 기존 소비처(shouldRedirectOutOfInGame)의 계약이므로 건드리지
// 않고, 이 값은 같은 파일이 소유한 별도 읽기로 노출한다.
// ───────────────────────────────────────────────────────────────────────────
let identityRebindPending = false
const identityRebindListeners = new Set()

function setIdentityRebindPending(next) {
  if (identityRebindPending === next) return
  identityRebindPending = next
  for (const listener of [...identityRebindListeners]) listener()
}

export function getInGameSnapshotRebindPending() {
  return identityRebindPending
}

export function subscribeInGameSnapshotRebindPending(listener) {
  identityRebindListeners.add(listener)
  return () => identityRebindListeners.delete(listener)
}

/**
 * 신원 재결속 진행 여부를 읽는다. InGamePage가 결과 화면 이동의 보류 조건으로 소비한다.
 */
export function useInGameSnapshotRebindPending() {
  return useSyncExternalStore(
    subscribeInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
    getInGameSnapshotRebindPending,
  )
}

/**
 * F-23(AC-05/AC-06): 지금 이 화면이 들고 있는 **내 소속 식별자**.
 *
 * 같은 판에서 이탈→재입장·추방→재입장하면 gameId·계정·소켓 객체가 전부 그대로인 채 이 값만
 * 바뀐다 — 그 구간을 지나온 옛 응답을 걸러내는 유일한 값이다. 요청 시점과 응답 시점 모두
 * 같은 함수로 읽어 기준이 갈리지 않게 한다(createLeaveGameSessionRequest와 같은 계산).
 */
function readCurrentMembershipId() {
  const { state } = useInGameStore.getState()
  const me = useAuthStore.getState().user?.uuid ?? null
  if (!state || !me) return null
  return (state.players ?? []).find((player) => player.uuid === me)?.membershipId ?? null
}

/** 지금 이 순간의 인증 축. 요청 캡처와 응답 재확인이 같은 함수를 쓴다. */
function readCurrentAuthScope() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.user?.uuid ?? null,
    identityGeneration: auth.identityGeneration ?? null,
  }
}

/**
 * 인게임 진입/재접속 시 get_session_snapshot을 요청해 3A의 원자적 복원(useInGameStore의
 * applySessionSnapshot)에 먹인다. 이미 연결된 상태로 활성화되면 즉시 한 번, 이후 매 실제
 * "connect"(재연결)마다 한 번씩만 요청한다 — useInGameRoleRevealAck의 mounted/generation
 * 방어와 useMatchingRoom의 socket・인증 계정 identity 재확인 패턴을 이 반복 요청 흐름에
 * 맞게 결합한다.
 *
 * ── F-23(SPLIT-1): 공유 신원 전이도 요청 세대를 연다 ───────────────────────────
 *
 * 예전에는 effect 의존성이 socket·gameId·계정 uuid·인증 전이 세대뿐이었다. 같은 판에서
 * 소속만 교체되는 전이(이탈→재입장, 추방→재입장)는 그 넷이 전부 같으므로 새 세대가 열리지
 * 않았고, 그러면 그 구간을 지나온 옛 응답을 거부한 뒤 **현재 신원의 새 요청이 영영 나가지
 * 않아** 화면이 확인 중에 갇혔다. 이제 store가 소유한 계정/소속 축의 전이 세대를 함께
 * 구독한다(같은 배치의 A→B→A도 두 전이로 남는다).
 *
 * 반대로 **우리 자신의 정상 복원**이 만든 후속 범위(빈 store bootstrap이 gameId·소속을 처음
 * 채우는 경우)는 이미 충족된 요청으로 기록해 새 세대를 열지 않는다 — 그러지 않으면 복원이
 * 곧바로 다음 요청을 만들고 그 응답이 다시 복원을 만드는 되먹임이 된다.
 */
export function useInGameSessionSnapshotSync() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  // F-23(AC-05/AC-06): 인증 전이 횟수도 **구독**한다. 계정 값만 보면 A→B→A는 deps가 그대로라
  // 새 세대가 열리지 않는다 — 그러면 그 구간을 지나온 옛 응답을 거부한 뒤 현재 신원의 새 요청도
  // 영영 나가지 않아 bootstrapStatus가 'checking'에 갇힌다. 전이 횟수가 그 경계를 만든다.
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  // F-23(SPLIT-1): 계정/소속 축의 공유 전이 세대(ingameStore가 set마다 동기적으로 기록한다).
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const [bootstrapStatus, setBootstrapStatus] = useState(gameId ? "ready" : "checking")

  const mountedRef = useRef(true)
  const epochVersionRef = useRef(0)
  const epochBaseRef = useRef({
    socket: undefined, gameId: undefined, authUuid: undefined,
    identityGeneration: undefined, identityScopeVersion: undefined,
  })
  const requestedVersionRef = useRef(-1)
  // 이 훅 인스턴스가 기준값을 한 번이라도 관측했는가. 첫 실행은 "전이"가 아니다 — 비교할
  // 이전 신원이 아직 없으므로 재결속 보류를 만들지 않는다(마운트마다 이동이 막히지 않는다).
  const observedBaseRef = useRef(false)
  // 우리 자신의 정상 복원이 만든 후속 범위. 이 범위로의 전이는 새 요청을 만들지 않는다.
  const fulfilledRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // 이 화면이 사라지면 재결속도 끝난다 — 보류 상태를 다음 화면으로 넘기지 않는다.
      setIdentityRebindPending(false)
    }
  }, [])

  useEffect(() => {
    if (!socket || !authUuid) return

    // StrictMode의 setup→cleanup→setup 재실행은 deps가 완전히 같은 채로 이 effect 본문을
    // 다시 부른다 — 이때는 epochBaseRef와 현재 값이 같으므로 새 세대로 보지 않는다. 반면
    // socket/gameId/authUuid/인증 세대/소속 전이 세대 중 하나라도 실제로 바뀐 재실행은
    // 진짜 새 세대다.
    const base = epochBaseRef.current
    const isFirstRun = !observedBaseRef.current
    observedBaseRef.current = true
    const fulfilled = fulfilledRef.current
    const isSelfCommitted = fulfilled !== null
      && fulfilled.socket === socket
      && fulfilled.gameId === gameId
      && fulfilled.authUuid === authUuid
      && fulfilled.identityGeneration === identityGeneration
      && fulfilled.identityScopeVersion === identityScopeVersion
    const changed = base.socket !== socket || base.gameId !== gameId || base.authUuid !== authUuid
      || base.identityGeneration !== identityGeneration
      || base.identityScopeVersion !== identityScopeVersion
    // 기준은 항상 현재 값으로 옮긴다 — 충족된 전이라도 다음 비교의 기준이 어긋나면 안 된다.
    epochBaseRef.current = { socket, gameId, authUuid, identityGeneration, identityScopeVersion }
    if (changed && !isSelfCommitted) {
      epochVersionRef.current += 1
      // 이미 판을 들고 있는 화면의 신원 전이다 — 현재 신원의 스냅샷으로 다시 묶일 때까지
      // 결과 화면 이동을 보류시킨다. 요청이 실제로 나갈 수 있을 때만 올린다(끊긴 화면을
      // 영원히 붙잡아 두지 않는다).
      if (!isFirstRun && gameId && socket.connected) setIdentityRebindPending(true)
    }

    const requestSnapshot = () => {
      const requestEpochVersion = epochVersionRef.current
      /** 이 세대의 요청이 끝났다 — 더 새로운 세대가 열려 있으면 그쪽 보류를 건드리지 않는다. */
      const finishRebind = () => {
        if (epochVersionRef.current !== requestEpochVersion) return
        setIdentityRebindPending(false)
      }
      // 이 세대에서 이미 요청을 보냈다면 다시 보내지 않는다 — StrictMode 이중 호출과, 같은
      // 세대 안에서 connect 핸들러와 "이미 연결됨" 분기가 동시에 조건을 만족하는 경우를
      // 하나의 네트워크 호출로 합친다.
      if (requestedVersionRef.current === requestEpochVersion) return
      requestedVersionRef.current = requestEpochVersion

      const requestSocket = socket
      const requestGameId = gameId
      const requestAuthUuid = authUuid
      // F-23(AC-05/AC-06): 요청을 **보내는 그 순간**의 신원을 함께 캡처한다. 같은 Socket 객체가
      // 재연결되면 객체 동일성은 유지되고 id만 바뀌므로 id를 따로 들고 있어야 한다.
      const requestIdentityGeneration = identityGeneration
      const requestMembershipId = readCurrentMembershipId()
      const requestSocketId = requestSocket?.id ?? null
      // F-23(SPLIT-1): store에 그대로 건네 줄 수신 문맥. 응답 payload에서 읽지 않는다 —
      // 이 한 벌이 "누가·어느 연결에서 요청했는가"의 유일한 근거다.
      const receiptContext = readInGameReceiptScope({
        accountId: requestAuthUuid, identityGeneration: requestIdentityGeneration,
      })

      /** 응답·실패·예외 어느 경로에서도 같은 기준으로 묻는다(한쪽만 느슨하면 그쪽으로 샌다). */
      const isStaleNow = () => {
        const auth = readCurrentAuthScope()
        const currentScope = readInGameReceiptScope(auth)
        return isStaleSessionSnapshotAckResponse({
          mounted: mountedRef.current,
          requestEpochVersion,
          currentEpochVersion: epochVersionRef.current,
          requestGameId,
          currentGameId: useInGameStore.getState().gameId,
          requestAuthUuid,
          currentAuthUuid: auth.accountId,
          requestSocket,
          currentSocket: getSocket(),
          requestIdentityGeneration,
          currentIdentityGeneration: auth.identityGeneration,
          requestMembershipId,
          currentMembershipId: readCurrentMembershipId(),
          requestSocketId,
          currentSocketId: getSocket()?.id ?? null,
          // 소속 전이·소켓 객체·실제 connect 세대. 값이 원래대로 돌아오는 왕복(A→B→A)은
          // 위 값 비교로는 드러나지 않는다 — 전이 **횟수**만이 그 구간을 남긴다.
          requestMembershipEpoch: receiptContext.membershipEpoch,
          currentMembershipEpoch: currentScope.membershipEpoch,
          requestSocketEpoch: receiptContext.socketEpoch,
          currentSocketEpoch: currentScope.socketEpoch,
          requestSocketConnected: receiptContext.socketConnected,
          currentSocketConnected: currentScope.socketConnected,
        })
      }

      /** 정상 복원이 만든 후속 범위를 "충족된 요청"으로 남긴다(되먹임 방지). */
      const rememberFulfilled = () => {
        const auth = readCurrentAuthScope()
        fulfilledRef.current = {
          socket: getSocket(),
          gameId: useInGameStore.getState().gameId,
          authUuid: auth.accountId,
          identityGeneration: auth.identityGeneration,
          identityScopeVersion: getInGameIdentityScopeVersion(),
        }
      }

      let ackPromise = null
      try {
        ackPromise = requestSocket
          .timeout(SESSION_SNAPSHOT_TIMEOUT_MS)
          .emitWithAck("get_session_snapshot", requestGameId ? { gameId: requestGameId } : {})
      } catch {
        // 동기 전송 예외도 실패와 **같은 세대 검사**를 거친다(한쪽만 느슨하면 그쪽으로 샌다).
        // 이 세대에는 더 이상 올 응답이 없다 — 재결속 보류를 여기서 끝맺는다(무한 보류 방지).
        finishRebind()
        if (isStaleNow()) return
        if (!requestGameId) setBootstrapStatus("failed")
        return
      }

      ackPromise
        .then((response) => {
          finishRebind()
          if (isStaleNow()) return
          if (!requestGameId) {
            if (response?.ok !== true) {
              setBootstrapStatus("missing")
              return
            }
            useInGameStore.getState().bootstrapSessionSnapshot(response, receiptContext)
            const recovered = Boolean(useInGameStore.getState().gameId)
            if (recovered) rememberFulfilled()
            setBootstrapStatus(recovered ? "recovered" : "missing")
            return
          }
          // 3A가 이미 완성한 원자적 검증/병합(applySessionSnapshotPure)에 그대로 위임한다 —
          // 형태가 잘못됐거나 ok:false인 응답은 그 함수 내부에서 참조 보존 no-op으로 처리되므로
          // 여기서 별도로 응답 형태를 분기하지 않는다. 수신 문맥은 store가 적용 직전에 한 번 더
          // 맞춰 보고, 실제로 반영된 경우에만 공개 결과의 수신 증거로 기록한다.
          const seqBefore = useInGameStore.getState().snapshotSeq
          useInGameStore.getState().applySessionSnapshot(response, receiptContext)
          if (useInGameStore.getState().snapshotSeq !== seqBefore) rememberFulfilled()
        })
        .catch(() => {
          finishRebind()
          // 타임아웃/전송 오류: 조용히 무시한다. 다음 재연결이 새 세대로 다시 요청한다.
          //
          // F-21(AC-05): 실패도 **성공과 같은 세대 검사**를 통과해야 한다. 옛 bootstrap 조회가
          // 늦게 실패하는 동안 이미 새 게임·새 계정·새 연결이 들어와 있을 수 있는데, 그때
          // failed로 덮으면 방금 복원된 화면이 "세션 없음"으로 되돌아간다.
          if (isStaleNow()) return
          if (!requestGameId) setBootstrapStatus("failed")
        })
    }

    const handleConnect = () => {
      // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(이미 열린 연결에는 절대
      // 다시 발생하지 않는다) — manager 수준의 "reconnect" 리스너는 별도로 두지 않는다.
      epochVersionRef.current += 1
      // 재연결은 연결 축의 전이다 — 그 순간 사망 연출 큐는 이전 연결의 것이라 버려지므로,
      // 이 연결의 스냅샷이 도착할 때까지 결과 화면 이동을 보류시킨다.
      if (useInGameStore.getState().gameId) setIdentityRebindPending(true)
      requestSnapshot()
    }

    socket.on("connect", handleConnect)

    // 이미 연결된 상태로 활성화된 경우를 다루기 위해, 리스너 등록 다음에 connected를 읽는다.
    // requestSnapshot()이 세대당 멱등이므로, 이 분기와 connect 핸들러가 같은 세대에 대해
    // 동시에 유효해지더라도 실제 네트워크 호출은 한 번만 나간다.
    if (socket.connected) {
      requestSnapshot()
    }

    return () => {
      socket.off("connect", handleConnect)
    }
  }, [socket, gameId, authUuid, identityGeneration, identityScopeVersion])

  return bootstrapStatus
}
