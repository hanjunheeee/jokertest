import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { isStaleSessionSnapshotAckResponse } from "../utils/isStaleSessionSnapshotAckResponse.js"
import { parseNightTurnStartedPayload } from "../utils/parseNightTurnStartedPayload.js"

const SESSION_SNAPSHOT_TIMEOUT_MS = 5000

// ───────────────────────────────────────────────────────────────────────────
// F-26(AC-01): **같은 연결 안의 제한된 재조회**
//
// 서버는 채널 재가입이 아직 끝나지 않은 조회에 SESSION_ROUTING_PENDING으로 답한다(빈 복원
// 성공으로 오인시키지 않기 위한 명시적 보류다). 그 답을 받고 아무것도 하지 않으면 재가입이
// 끝난 뒤에도 이 연결은 다시 묻지 않고, 그 사이 복원돼야 할 미완료 성공 사건이 이 연결
// 내내 화면에 오지 않는다. 그래서 **이미 snapshot 요청을 소유한 이 훅 안에서** 다시 묻는다 —
// 새 훅·서버 타이머·connect 수신 훅으로 재시도 소유자를 나누지 않는다.
//
// 상한은 유한하고 작다: 시도 사이 250ms · 최초 시도부터 총 5초 · 최대 20회 · 동시 1요청.
// 각 ack timeout은 남은 예산만 쓴다(마지막 시도가 예산을 넘겨 기다리지 않는다). 영구 오류
// (배제·다른 판·형태 오류)는 재시도하지 않는다 — 그 답은 기다려도 바뀌지 않는다.
// ───────────────────────────────────────────────────────────────────────────
const SNAPSHOT_RETRY_DELAY_MS = 250
const SNAPSHOT_RETRY_BUDGET_MS = 5000
const SNAPSHOT_MAX_ATTEMPTS = 20
/** 이 코드만 "지금은 아직 준비되지 않았다"는 뜻이다(재조회 대상). */
const SESSION_ROUTING_PENDING_CODE = "SESSION_ROUTING_PENDING"

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

// ───────────────────────────────────────────────────────────────────────────
// F-27b(AC-01): **조회 중에 대기가 바뀌었는가**
//
// 조회 응답의 presentationWaiting은 서버가 그 응답을 만든 **그 순간**의 사실이다. 그 사이에
// 같은 연결로 waiting:false(해제)나 다음 역할 턴 시작이 도착했다면, 늦게 도착한 응답을
// 그대로 커밋하는 순간 이미 끝난 대기가 화면에 되살아난다(반대로 조회 중 새 대기가 시작된
// 경우에는 방금 받은 true가 옛 false로 덮인다).
//
// 그래서 요청 **전에** 두 알림을 읽기 전용으로 관측해 **게임·밤별 순번**만 센다. 화면 상태는
// 조금도 만들지 않는다(빈 store에서도 마찬가지다 — 그 판이 무엇인지 아직 모르므로 추정하지
// 않고 payload가 말하는 게임·밤으로만 센다). 응답이 말하는 게임·밤의 순번이 요청 뒤에 바뀌었
// 으면 그 응답 전체를 커밋하지 않고 기존 제한 재조회로 **현재 값**을 다시 얻는다. 예산이
// 소진되면 기존 실패 처리로 끝낸다 — 옛 응답을 승격하지 않는다.
// ───────────────────────────────────────────────────────────────────────────

/** 관측 순번의 키. 같은 판의 다른 밤은 서로 다른 사실이다. */
function nightObservationKey(gameId, nightDayIndex) {
  return `${gameId}|${nightDayIndex}`
}

/** night_presentation_wait 알림의 형태 검사(store의 허용 키 계약과 같은 셋이다). */
function readWaitObservationTarget(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (Object.keys(payload).length !== 3) return null
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return null
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
  if (typeof payload.waiting !== "boolean") return null
  return nightObservationKey(payload.gameId, payload.nightDayIndex)
}

/**
 * night_turn_started 알림의 형태 검사. 기존 파서를 그대로 쓰되 payload 자신의 게임·날짜로
 * 대조한다 — 빈 store는 아직 판을 모르므로 "현재 판과 같은가"를 물을 수 없고, 여기서 필요한
 * 것은 "이 알림이 어느 판·어느 밤을 말하는가"뿐이다(화면 상태는 만들지 않는다).
 */
function readTurnStartObservationTarget(payload) {
  const parsed = parseNightTurnStartedPayload({
    payload, gameId: payload?.gameId, dayIndex: payload?.dayIndex,
  })
  if (!parsed) return null
  return nightObservationKey(parsed.gameId, parsed.dayIndex)
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
  // F-26(AC-01): 이 세대의 재조회 예산(최초 시도 시각 기준). 세대가 바뀌면 통째로 새로 만들고,
  // 옛 예약은 객체 동일성 비교로 스스로 무효가 된다.
  const retryRef = useRef({ epoch: -1, attempts: 0, deadline: 0, timerId: null })
  // F-27b(AC-01): 게임·밤별 관측 순번(키 → 관측 횟수). 화면 상태가 아니라 "조회 중에 이 밤의
  // 대기가 움직였는가"만 세는 부기다.
  const nightObservationsRef = useRef(new Map())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // 이 화면이 사라지면 재결속도 끝난다 — 보류 상태를 다음 화면으로 넘기지 않는다.
      setIdentityRebindPending(false)
      // 예약된 재조회도 함께 끝낸다(사라진 화면이 요청을 남기지 않는다).
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
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

    /**
     * F-27b(AC-01): 요청보다 **먼저** 설치하는 읽기 전용 관측. 이 연결·이 인증의 알림만 센다 —
     * 소켓이 교체됐거나 계정이 바뀐 뒤 도착한 알림은 이 요청이 견줄 사실이 아니다.
     */
    const isObservableNow = () =>
      mountedRef.current && getSocket() === socket
      && (useAuthStore.getState().user?.uuid ?? null) === authUuid

    const noteNightObservation = (key) => {
      if (key === null) return
      const book = nightObservationsRef.current
      book.set(key, (book.get(key) ?? 0) + 1)
    }

    const observeWaitNotice = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readWaitObservationTarget(payload))
    }
    const observeTurnStart = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readTurnStartObservationTarget(payload))
    }
    socket.on("night_presentation_wait", observeWaitNotice)
    socket.on("night_turn_started", observeTurnStart)

    /** 예약된 재조회를 취소한다(전이·언마운트·새 connect가 옛 예약을 남기지 않는다). */
    const cancelScheduledRetry = () => {
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }

    const requestSnapshot = ({ retry = false } = {}) => {
      const requestEpochVersion = epochVersionRef.current
      if (!retry) {
        // 이 세대에서 이미 요청을 보냈다면 다시 보내지 않는다 — StrictMode 이중 호출과, 같은
        // 세대 안에서 connect 핸들러와 "이미 연결됨" 분기가 동시에 조건을 만족하는 경우를
        // 하나의 네트워크 호출로 합친다.
        if (requestedVersionRef.current === requestEpochVersion) return
        requestedVersionRef.current = requestEpochVersion
        // 이 세대의 재조회 예산을 **최초 시도 시각 기준**으로 연다(옛 예약은 여기서 버려진다).
        cancelScheduledRetry()
        retryRef.current = {
          epoch: requestEpochVersion,
          attempts: 0,
          deadline: Date.now() + SNAPSHOT_RETRY_BUDGET_MS,
          timerId: null,
        }
      }
      const attemptBudget = retryRef.current
      // 예산이 이 세대의 것이 아니면(전이 이후 도착한 옛 예약) 아무 요청도 만들지 않는다.
      if (attemptBudget.epoch !== requestEpochVersion) return
      attemptBudget.attempts += 1
      // 각 시도는 **남은 예산만** 기다린다. 첫 시도는 예산 전체이므로 기존 5초와 같다.
      const ackTimeoutMs = Math.max(
        1, Math.min(SESSION_SNAPSHOT_TIMEOUT_MS, attemptBudget.deadline - Date.now()),
      )

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
      // F-27b(AC-01): 이 시도가 나가는 순간의 관측 순번 사본. 응답이 도착했을 때 같은 키의
      // 값이 달라져 있으면 그 응답은 이미 지나간 사실이다(같은 값의 반복 알림도 순번에는
      // 남으므로, 반복 방송 뒤에 도착한 응답도 현재 값으로 다시 확인한다).
      const observationsAtRequest = new Map(nightObservationsRef.current)

      /**
       * 이 응답이 말하는 게임·밤의 관측이 요청 뒤에 바뀌었는가.
       *
       * 응답이 NIGHT을 말하면 그 밤 하나만 견준다. 그 밖의 단계(DAY·TRIBUNAL·ENDED)를 말하는
       * 응답은 특정 밤을 지목하지 않으므로, 같은 판의 관측 **전부**를 견준다(그 사이에 새 밤의
       * 대기가 시작됐다면 이 응답의 false가 그것을 덮으면 안 된다).
       */
      const hasConflictingNightObservation = (response) => {
        const responseGameId = typeof response?.gameId === "string" && response.gameId.length > 0
          ? response.gameId
          : requestGameId
        if (!responseGameId) return false
        const keys = response?.phase === "NIGHT" && Number.isInteger(response?.dayIndex)
          ? [nightObservationKey(responseGameId, response.dayIndex)]
          : [...nightObservationsRef.current.keys()].filter((key) => key.startsWith(`${responseGameId}|`))
        return keys.some((key) =>
          (nightObservationsRef.current.get(key) ?? 0) !== (observationsAtRequest.get(key) ?? 0))
      }

      /** 지금 이 순간의 범위. 요청 캡처와 끝맺기 판정이 같은 함수를 쓴다(기준이 갈리지 않는다). */
      const readScopeNow = () => readInGameReceiptScope(readCurrentAuthScope())

      /**
       * F-23(AC-05 보수): **이 응답을 낳은 요청이 아직 현재의 것인가.**
       *
       * 예전에는 아래 두 끝맺기가 요청 세대(epochVersionRef)만 확인했다. 그 세대는 effect가
       * 다시 돌아야 오르는 값이라, "재결속 도중 신원이 전이했지만 아직 React가 리렌더하지
       * 않은" 창에서는 **옛 값 그대로**다 — 그 창에 도착한 옛 요청의 응답이 현재 신원이
       * 짊어진 재결속 보류를 풀고 현재 종료 결과까지 무효화할 수 있었다(같은 판에서 소속만
       * 교체되는 전이, 끊김, sid 재발급이 전부 이 창을 지난다).
       *
       * 그래서 판정의 기준을 ref가 아니라 **범위**로 옮긴다: 요청 시점에 캡처한 receipt
       * scope(계정·인증 전이 세대·판·소속·소속 전이 세대·소켓 세대·sid·연결 상태)가 끝맺는
       * 그 순간의 현재 범위와 **여덟 축 모두** 같을 때만 상태를 바꾼다. 하나라도 다르면 아무
       * 것도 하지 않는다 — 그 보류는 현재 범위의 요청이 스스로 끝맺는다.
       *
       * 세대 검사는 그대로 함께 둔다(더 느슨해지지 않게 한다). 범위가 우연히 같은 채로 새
       * 세대가 열리는 경우(같은 sid로 다시 열린 connect 등)는 세대만이 가른다.
       *
       * @param scopeAtDecision 끝맺기를 결정한 그 순간의 현재 범위. **이 요청 자신이 만든
       *   store 변경 이전** 값이어야 한다 — 정상 복원이 gameId·소속을 채우면 범위가 바뀌는데,
       *   그것을 이유로 자기 보류를 못 풀면 화면이 영영 갇힌다.
       */
      const ownsCurrentScope = (scopeAtDecision) =>
        epochVersionRef.current === requestEpochVersion
        && isSameInGameReceiptScope(receiptContext, scopeAtDecision)

      /**
       * 이 요청이 현재 신원의 스냅샷을 **실제로 적용하고** 끝났다 — 보류를 그냥 푼다.
       * 더 새로운 세대·다른 범위가 열려 있으면 그쪽 보류는 그쪽 요청이 끝맺는다(건드리지 않는다).
       */
      const finishRebindApplied = (scopeAtDecision) => {
        if (!ownsCurrentScope(scopeAtDecision)) return
        setIdentityRebindPending(false)
      }

      /**
       * F-23(SPLIT-1): 이 세대의 요청이 **스냅샷을 적용하지 못한 채** 끝났다(타임아웃·전송
       * 오류·동기 예외·거부·ok:false·범위 불일치).
       *
       * 여기서 보류만 풀면 화면은 아직 **이전 신원·이전 연결이 받아 둔** state를 들고 있는
       * 채로 결과 이동 보류가 풀린다 — 잔존 ENDED·winResult가 그대로 이동 근거가 되어
       * (InGamePage → useInGameResultNavigation), 이 보류가 막으려던 바로 그 결함이 실패
       * 경로로 되살아난다. 그래서 푸는 **대신**이 아니라 푸는 **전에** 그 이동 근거를
       * 무효화한다.
       *
       * 보류를 계속 붙들어 두지는 않는다 — 실패가 이어져도 화면은 인게임에 남아 기존 상단
       * 나가기·복구 UI를 그대로 쓸 수 있고, 다음 연결의 정상 스냅샷이 종료 결과를 다시
       * 실으면 이동이 재개된다(useInGameStore.invalidateUnconfirmedTerminalResult 참고).
       *
       * 애초에 보류를 짊어지지 않은 요청(첫 진입의 평범한 동기화)은 이전 신원의 잔존 상태를
       * 들고 있지 않으므로 아무것도 무효화하지 않는다 — 일시적인 조회 실패가 방금 받은
       * 정상 종료 결과를 지우면 안 된다.
       *
       * **무엇이 잔존물인지는 store가 판정한다.** 재결속 구간이라도 그 사이에 현재 연결이
       * 정상 공개 종료(night_result_applied)를 직접 받았을 수 있다 — 그 결과는 이전 신원의
       * 잔존물이 아니므로 스냅샷 실패로 지워지면 안 된다. 그래서 여기서는 "확인하지 못한 채
       * 끝났다"와 **지금 이 순간의 인증 범위**만 알리고, 실제로 걷어낼지는 winResult에 함께
       * 적힌 수신 범위를 아는 invalidateUnconfirmedTerminalResult가 결정한다.
       *
       * 현재 범위는 요청 시점 값이 아니라 **끝맺는 이 순간**에 읽은 값(scopeAtDecision)이다 —
       * 요청을 보낸 뒤 인증이 A→B→A로 왕복했더라도 계정 값은 원래대로 돌아오므로, 그 구간을
       * 드러내는 것은 그때 읽은 인증 전이 세대뿐이다(store도 연결도 그대로인 경우가 바로 그
       * 자리다). 그 범위가 이 요청의 범위와 다르면 여기서는 **아무것도 바꾸지 않는다**.
       */
      const finishRebindUnapplied = (scopeAtDecision) => {
        if (!ownsCurrentScope(scopeAtDecision)) return
        if (!getInGameSnapshotRebindPending()) return
        useInGameStore.getState().invalidateUnconfirmedTerminalResult(scopeAtDecision)
        setIdentityRebindPending(false)
      }

      /**
       * F-26(AC-01): **이 세대의 조회가 적용 없이 끝났다 — 더 물을 것이 남아 있지 않을 때만.**
       *
       * 재결속 보류와 bootstrapStatus는 "확인하지 못한 채 끝났다"를 알리는 값이다(F-23 SPLIT-1).
       * 재시도가 아직 예약돼 있는데 그것을 먼저 내려 버리면, 아직 답을 기다리는 중인 화면이
       * **실패로 확정**되고 뒤이은 성공 응답이 이미 내려간 결론을 다시 뒤집는다. 그래서 이 끝맺기는
       * 예산이 소진된(또는 애초에 재시도가 불가능한) 자리에서 한 번만 불린다.
       */
      const settleUnapplied = () => {
        // 끝맺기 판정의 현재 범위는 store를 건드리기 전에 읽는다(위 finishRebindUnapplied 참고).
        const scopeNow = readScopeNow()
        const stale = isStaleNow()
        finishRebindUnapplied(scopeNow)
        if (stale) return
        if (!requestGameId) setBootstrapStatus("failed")
      }

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

      /**
       * F-26(AC-01): 같은 연결에서 한 번 더 묻는다. 예약에 성공하면 true다 — 그때는 이 시도의
       * 실패로 재결속을 끝맺지 않는다(보류는 이 세대의 마지막 시도가 끝맺는다).
       *
       * 상한·전이·언마운트·소켓 교체를 모두 확인하고, 이미 예약이 있으면 새로 걸지 않는다
       * (동시 1요청). 예산이 다음 시도의 간격조차 남기지 않으면 더 묻지 않는다.
       */
      /** 이 예약·실행이 아직 **이 세대·이 예산·이 연결**의 것인가(아니면 남의 보류다). */
      const ownsRetrySlot = () =>
        mountedRef.current
        && epochVersionRef.current === requestEpochVersion
        && retryRef.current === attemptBudget
        && attemptBudget.epoch === requestEpochVersion
      /** 아직 시도 횟수가 남았는가. */
      const hasAttemptsLeft = () => attemptBudget.attempts < SNAPSHOT_MAX_ATTEMPTS
      /** 이 세대의 남은 예산(ms). 음수/0이면 총 5초를 이미 넘겼다. */
      const retryBudgetLeftMs = () => attemptBudget.deadline - Date.now()

      const scheduleRetry = () => {
        if (!ownsRetrySlot()) return false
        if (!hasAttemptsLeft()) return false
        // 다음 시도의 간격조차 예산 안에 들어가지 않으면 예약하지 않는다.
        if (retryBudgetLeftMs() <= SNAPSHOT_RETRY_DELAY_MS) return false
        if (attemptBudget.timerId !== null) return true
        attemptBudget.timerId = setTimeout(() => {
          attemptBudget.timerId = null
          // 남의 세대·남의 연결이면 아무 것도 하지 않는다(그쪽 보류는 그쪽 요청이 끝맺는다).
          if (!ownsRetrySlot()) return
          if (getSocket() !== requestSocket) return
          /**
           * F-26(AC-06): **타이머가 실행되는 이 순간 예산·횟수를 다시 검사한다.**
           *
           * 예약 시점의 검사만으로는 부족하다 — 예약과 실행 사이에 얼마나 흘렀는지는 예약이
           * 알 수 없다(느린 프레임, 탭 비활성화, 디버거 정지, 긴 동기 작업). 여기서 다시
           * 묻지 않으면 5초 예산을 한참 넘긴 뒤에도 전송이 나간다.
           *
           * 더 물을 수 없다면 이 자리가 이 세대의 마지막이다 — 앞선 실패가 미뤄 둔 끝맺기를
           * 여기서 수행한다(그래야 보류가 영영 남지 않는다).
           */
          if (!hasAttemptsLeft() || retryBudgetLeftMs() <= 0) {
            settleUnapplied()
            return
          }
          requestSnapshot({ retry: true })
        }, SNAPSHOT_RETRY_DELAY_MS)
        return true
      }

      /** 서버가 "아직 준비되지 않았다"고 답했는가(그 코드 하나만 재조회 대상이다). */
      const isRoutingPending = (response) =>
        response !== null && typeof response === "object"
        && response.ok !== true && response.code === SESSION_ROUTING_PENDING_CODE

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
          .timeout(ackTimeoutMs)
          .emitWithAck("get_session_snapshot", requestGameId ? { gameId: requestGameId } : {})
      } catch {
        // 동기 전송 예외도 실패와 **같은 세대·범위 검사**를 거친다(한쪽만 느슨하면 그쪽으로 샌다).
        //
        // F-26(AC-01): 이 경로에서는 **아무 것도 나가지 않았다** — ack 창을 쓰지 않았으므로 이
        // 세대의 예산이 그대로 남아 있다. 남은 예산으로 한 번 더 묻고, 재시도가 예약된 동안에는
        // 실패로 확정하지 않는다(예산이 소진된 뒤 마지막 시도가 settleUnapplied로 끝맺는다).
        // 그러지 않으면 아직 답을 기다리는 화면이 첫 실패에서 'failed'로 굳는다.
        if (!isStaleNow() && scheduleRetry()) return
        settleUnapplied()
        return
      }

      ackPromise
        .then((response) => {
          // 끝맺기 판정의 기준이 되는 현재 범위는 **이 요청이 store를 건드리기 전**에 읽는다 —
          // 정상 복원이 gameId·소속을 채우면 범위가 바뀌는데, 그것을 자기 자신의 실격 근거로
          // 삼으면 방금 성공한 요청이 자기 보류를 못 풀어 화면이 갇힌다.
          const scopeOnArrival = readScopeNow()
          if (isStaleNow()) {
            // 이 응답은 지금 화면의 사실이 아니다 — 아무것도 적용하지 않는다.
            finishRebindUnapplied(scopeOnArrival)
            return
          }
          // F-26(AC-01): 채널 재가입이 끝나지 않았다는 답이다. 예산이 남아 있으면 같은 연결에서
          // 다시 묻고 이 시도로는 아무 결론도 내리지 않는다(빈 복원 성공으로 읽지 않는다).
          if (isRoutingPending(response) && scheduleRetry()) return
          // F-27b(AC-01): 조회 중에 이 밤의 대기가 움직였다면 이 응답은 이미 지나간 사실이다 —
          // 아무것도 커밋하지 않고 같은 연결에서 현재 값을 다시 묻는다. 예산이 소진됐으면 기존
          // 실패 경로로 끝낸다(옛 응답을 승격하지 않는다).
          if (hasConflictingNightObservation(response)) {
            if (scheduleRetry()) return
            settleUnapplied()
            return
          }
          if (!requestGameId) {
            if (response?.ok !== true) {
              finishRebindUnapplied(scopeOnArrival)
              setBootstrapStatus("missing")
              return
            }
            useInGameStore.getState().bootstrapSessionSnapshot(response, receiptContext)
            const recovered = Boolean(useInGameStore.getState().gameId)
            if (recovered) {
              rememberFulfilled()
              finishRebindApplied(scopeOnArrival)
            } else {
              finishRebindUnapplied(scopeOnArrival)
            }
            setBootstrapStatus(recovered ? "recovered" : "missing")
            return
          }
          // 3A가 이미 완성한 원자적 검증/병합(applySessionSnapshotPure)에 그대로 위임한다 —
          // 형태가 잘못됐거나 ok:false인 응답은 그 함수 내부에서 참조 보존 no-op으로 처리되므로
          // 여기서 별도로 응답 형태를 분기하지 않는다. 수신 문맥은 store가 적용 직전에 한 번 더
          // 맞춰 보고, 실제로 반영된 경우에만 공개 결과의 수신 증거로 기록한다.
          //
          // snapshotSeq가 실제로 올랐는가가 "적용됐는가"의 유일한 판정이다 — 거부된 응답으로
          // 재결속을 끝맺으면 확인하지 못한 옛 종료 상태가 그대로 이동 근거로 남는다.
          const seqBefore = useInGameStore.getState().snapshotSeq
          useInGameStore.getState().applySessionSnapshot(response, receiptContext)
          if (useInGameStore.getState().snapshotSeq !== seqBefore) {
            rememberFulfilled()
            finishRebindApplied(scopeOnArrival)
            return
          }
          finishRebindUnapplied(scopeOnArrival)
        })
        .catch(() => {
          // 타임아웃/전송 오류: 조용히 무시한다. 다음 재연결이 새 세대로 다시 요청한다.
          //
          // F-21(AC-05): 실패도 **성공과 같은 세대 검사**를 통과해야 한다. 옛 bootstrap 조회가
          // 늦게 실패하는 동안 이미 새 게임·새 계정·새 연결이 들어와 있을 수 있는데, 그때
          // failed로 덮으면 방금 복원된 화면이 "세션 없음"으로 되돌아간다.
          //
          /**
           * F-26(AC-01): **비동기 거부도 동기 전송 예외와 같은 규칙으로 끝맺는다.**
           *
           * 이 거부가 언제나 ack 창의 만료라는 보장은 없다. 전송 계층은 창이 다 흐르기 전에도
           * 거부할 수 있다(연결이 닫히는 중이라 emit이 실패, 직렬화·어댑터 오류, 서버가 ack를
           * 오류로 돌려준 경우). 그 **이른 거부**를 timeout과 같이 취급해 그 자리에서 실패로
           * 확정하면, 예산이 아직 몇 초 남았는데도 이 연결은 다시 묻지 않고 화면이 굳는다 —
           * 동기 예외 경로에만 넣어 둔 "예산이 남아 있으면 다시 묻는다"가 여기에는 빠져 있었다.
           *
           * 그래서 판정 기준을 거부의 **종류**가 아니라 **남은 예산**으로 한 곳에 모은다. 진짜
           * timeout은 그 시도의 ack 창이 곧 남은 예산 전체이므로(ackTimeoutMs = min(5000,
           * deadline - now)) 도착 시점에 예산이 없고, scheduleRetry가 스스로 false를 돌려준다 —
           * 즉 timeout 경로의 결말(그 자리에서 끝맺기)은 그대로다.
           */
          if (!isStaleNow() && scheduleRetry()) return
          settleUnapplied()
        })
    }

    const handleConnect = () => {
      // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(이미 열린 연결에는 절대
      // 다시 발생하지 않는다) — manager 수준의 "reconnect" 리스너는 별도로 두지 않는다.
      epochVersionRef.current += 1
      // 재연결은 연결 축의 전이다 — 그 순간 사망 연출 큐는 이전 연결의 것이라 버려지므로,
      // 이 연결의 스냅샷이 도착할 때까지 결과 화면 이동을 보류시킨다.
      if (useInGameStore.getState().gameId) setIdentityRebindPending(true)
      // 옛 세대의 예약은 여기서 끝난다(새 connect가 그 답을 기다리지 않는다).
      cancelScheduledRetry()

      /**
       * F-26(AC-04): **요청 범위 캡처는 microtask로 미룬다.**
       *
       * 같은 connect 사건을 useGameSessionSocketEvents도 구독하고 있고, 그쪽 리스너가
       * noteInGameConnectionRebound로 연결 세대를 올린다(이전 연결이 수락한 성공 사건 기록을
       * 취소하는 것도 그 자리다). 두 리스너의 등록 순서는 마운트 순서에 따라 달라지므로, 여기서
       * 즉시 범위를 캡처하면 그 순서에 따라 **옛 연결 세대로 요청이 나가는** 경우가 생긴다 —
       * 그 응답은 자기 검사에 걸려 버려지고, 이 연결은 다시 묻지 않는다.
       *
       * 세대 증가는 즉시 하고(옛 응답은 그 즉시 실격이다) 캡처만 미룬다. 예약이 실행될 때
       * 세대나 소켓이 달라졌으면 그 요청은 만들지 않는다.
       */
      const scheduledEpochVersion = epochVersionRef.current
      const scheduledSocket = socket
      queueMicrotask(() => {
        if (!mountedRef.current) return
        if (epochVersionRef.current !== scheduledEpochVersion) return
        if (getSocket() !== scheduledSocket) return
        requestSnapshot()
      })
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
      // F-27b(AC-01): 자기 관측 리스너만 해제하고 기록도 함께 비운다(다음 세대는 자기 요청
      // 뒤의 관측만 견준다 — 지나간 세대의 순번을 물려받지 않는다).
      socket.off("night_presentation_wait", observeWaitNotice)
      socket.off("night_turn_started", observeTurnStart)
      nightObservationsRef.current = new Map()
      // 이 세대의 예약도 함께 끝낸다 — 전이 뒤에 옛 예약이 깨어나 남의 연결로 묻지 않는다.
      cancelScheduledRetry()
    }
  }, [socket, gameId, authUuid, identityGeneration, identityScopeVersion])

  return bootstrapStatus
}
