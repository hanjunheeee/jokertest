import { useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대상이고(store/__tests__/
// nightPrivateResult.test.js), `@/` 별칭은 vite만 해석할 수 있어 그 실행을 막는다.
import { useMatchingStore, isCurrentRoomKickEvent } from "../../matching/store/matchingStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
// F-21(A-10): 전적 커밋 이후의 개인 캐시 무효화가 닿는 경계다. 세 store를 직접 import하지
// 않는 이유는 그쪽이 api 계층(shared/env.js의 import.meta.env)에 닿아 있어, 이 훅 자체가
// 플레인 Node에서 로드되지 않게 되기 때문이다 — 실제 store는 앱 진입점(ProtectedRoute)이
// 등록한다. 이 훅은 ProtectedRoute에 장착돼 로비에서도 살아 있으므로, 먼저 퇴장한 계정도
// 같은 신호를 받는다.
import { refreshAccountCaches, ACCOUNT_CACHE_SCOPES } from "../../../user/utils/accountCacheRefresh.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import {
  getInGameIdentityScopeVersion,
  isCurrentGameKickEvent,
  noteInGameConnectionRebound,
  readInGameReceiptScope,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
// F-26b(AC-01): 밤 성공 사건 수신은 store가 소유한 받은 그대로의 payload를 넘기므로 별도
// 파서가 없다(다른 apply*와 달리 형태 검증도 store 쪽 receiveNightSuccess가 한다).
import { createGameEndedHandler } from "../utils/createGameEndedHandler.js"
import { createSessionEndFinalizer } from "../utils/createSessionEndFinalizer.js"
import { createSelfDisconnectHandler } from "../utils/createSelfDisconnectHandler.js"
import { parseNightResultAppliedPayload } from "../utils/parseNightResultAppliedPayload.js"
import { parseInGameNightPrivateResultPayload } from "../utils/reduceInGameNightPrivateResult.js"
import { selectInGameSelfAlive } from "../utils/selectInGameSelfAlive.js"
import { parseDayPhaseChangedPayload } from "../utils/parseDayPhaseChangedPayload.js"
import { parseNightTurnStartedPayload } from "../utils/parseNightTurnStartedPayload.js"
import { parseNightTurnEndedPayload } from "../utils/parseNightTurnEndedPayload.js"
import { attachNightTurnSocketListeners } from "../utils/attachNightTurnSocketListeners.js"
import { parsePlayerEliminatedPayload } from "../utils/parsePlayerEliminatedPayload.js"
import { parseDayVoteResolvedPayload } from "./useInGameActionPanel.js"

// ---------------------------------------------------------------------------
// F-16 효과음 연결
//
// 공통 원칙 세 가지가 아래 모든 dispatch에 똑같이 적용된다.
//   1. **반영이 먼저다.** 각 핸들러는 기존 파서·store 검증을 그대로 통과시켜 canonical
//      상태를 먼저 바꾸고, 그 뒤에 소리를 낸다. 소리의 성공·실패·지연은 상태 전이·타이머·
//      결과 화면 진행에 영향을 주지 않는다(AC-06).
//   2. **검증을 통과한 live 사건만.** 파서가 null을 돌려준 payload(중복·stale·잘못된 roster)
//      에는 소리가 없다. applySessionSnapshot 같은 복원 경로는 이 핸들러들을 거치지 않으므로
//      재접속에도 소리가 나지 않는다(A-05).
//   3. **ID는 서버 canonical 값에서만 만든다.** 시각·난수·렌더 횟수를 쓰지 않으므로 같은
//      사건을 다시 전달해도 같은 문자열이고, 재생기가 중복으로 거른다(AC-04).
// ---------------------------------------------------------------------------

/** 종료로 인정하는 승자. 이 둘이 아니면 결과 사건을 만들지 않는다. */
const VALID_WINNERS = new Set(["CITIZEN", "JOKER"])

/** 현재 인증 계정. 로그인 상태가 아니면 서버 사건을 받아들이지 않는다. */
function currentAccountId() {
  const { user, isLoggedIn } = useAuthStore.getState()
  return isLoggedIn && user?.uuid ? user.uuid : null
}

/** 지금 이 순간의 수신 범위(계정 축 + store가 소유한 게임·소속·연결 축). */
function currentReceiptScope() {
  return readInGameReceiptScope({
    accountId: currentAccountId(),
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
}

/**
 * F-23(AC-05/SPLIT-1): 이 구독이 **등록된 그 순간**의 범위와 지금이 같은가.
 *
 * 이 훅은 ProtectedRoute에 장착돼 **로그인 직후의 로비에서도** 살아 있다. 그래서 계정이나
 * 게임이 아직 없던 시점에 등록된 구독이 그대로 남아 있을 수 있는데, 그때는 그 축으로 판정할
 * 것이 없다 — "아직 모른다"와 "이미 지나갔다"는 다른 사실이고, 앞의 것을 stale로 다루면
 * 정상 진입의 첫 사건들이 통째로 사라진다. 아래 effect가 계정·소속 축의 전이마다 현재 범위로
 * 다시 등록하므로, 비어 있던 축은 그 재등록에서 채워진다.
 *
 * 연결 축은 등록 시점이 언제든 항상 본다 — 소켓이 교체됐거나 그 사이 끊겼거나 재연결로 id가
 * 바뀐 뒤 도착한 사건은 이 화면이 보고 있는 연결의 사실이 아니다.
 *
 * **그래서 연결 세대도 구독 대상이어야 한다.** 같은 Socket 객체가 재연결되면 객체 동일성은
 * 그대로이고 id만 바뀐다 — 구독 effect가 그 전이를 보지 못하면 등록 문맥은 영영 옛 id를 들고
 * 있고, 이 함수는 그 뒤의 **정상** night_result_applied·night_action_result까지 전부 거부한다
 * (재연결 한 번으로 화면이 조용히 먹통이 된다). 아래 effect는 실제 connect마다 오르는 세대를
 * deps에 두어 현재 연결의 문맥으로 다시 등록한다.
 */
function isRegistrationScopeCurrent(registered) {
  const now = currentReceiptScope()
  if (registered.socketEpoch !== now.socketEpoch) return false
  if (registered.socketId !== now.socketId) return false
  if (registered.socketConnected !== now.socketConnected) return false
  if (registered.accountId !== null) {
    if (registered.accountId !== now.accountId) return false
    if (registered.identityGeneration !== now.identityGeneration) return false
  }
  if (registered.gameId === null) return true
  if (registered.gameId !== now.gameId) return false
  if (registered.membershipId !== now.membershipId) return false
  if (registered.membershipEpoch !== now.membershipEpoch) return false
  return true
}

/** 게임 범위 사건 하나를 공통 재생기로 넘긴다. 절대 던지지 않는다. */
function playGameSfx(kind, eventId, gameId, origin = "live") {
  if (typeof eventId !== "string" || eventId.length === 0) return
  if (typeof gameId !== "string" || gameId.length === 0) return
  const accountId = currentAccountId()
  if (accountId === null) return
  dispatchSfxEvent({ kind, eventId, accountId, gameId, origin })
}

/**
 * 승패 결과음. 게임당 ID가 하나(game:<id>:result)뿐이라, 어느 terminal 경로(밤 결과·재판
 * 판정·끊김 사망)로 끝나도 소리는 한 번이다.
 *
 * 승패는 game_ended가 아니다 — game_ended는 세션 정리 신호이고, 화면이 결과로 넘어가는
 * 근거는 ENDED + winResult다(useInGameResultNavigation). 그래서 여기서도 그 두 값만 본다.
 * GameResultPage 진입 자체나 ?outcome= 미리보기는 이 경로를 거치지 않으므로 소리가 없다.
 */
function dispatchResultSfxIfEnded(origin = "live") {
  const current = useInGameStore.getState()
  if (!current.gameId || !current.state) return
  if (current.state.phase !== "ENDED") return
  if (!VALID_WINNERS.has(current.state.winResult?.winner)) return
  playGameSfx("game-result", `game:${current.gameId}:result`, current.gameId, origin)
}

/**
 * 인증된 계정이 있을 때만 계정 캐시 재조회를 전달한다. 실제 재조회는 등록된 store가
 * 소유하고(accountCacheRefresh), 이 훅은 "다시 읽어라"만 넘긴다.
 */
function requestAccountCacheRefresh(scopes, options) {
  if (currentAccountId() === null) return
  refreshAccountCaches(scopes, options)
}

/** 인게임 store와 matching store를 함께 초기화하고 로비로 이동하는 finalizer를 만든다. */
function buildFinalizer(navigate) {
  return createSessionEndFinalizer({
    clearGame: () => useInGameStore.getState().clearGame(),
    clearRoom: () => useMatchingStore.getState().clearRoom(),
    navigate,
  })
}

/**
 * GameSession이 서버에서 종료되면(game_ended, 또는 자신의 disconnect) 정리하고 /multiplay로
 * 돌아간다. ProtectedRoute에서 호출되어 로그인 상태가 유지되는 동안 라우트 전환과 무관하게
 * 계속 구독을 유지한다 — /ingame 마운트 시점에만 구독하면 game_started 이후
 * /ingame effect 등록 전 사이 구간에 도착하는 game_ended를 놓칠 수 있다.
 */
export function useGameSessionSocketEvents() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  // disconnect 리스너가 등록 시점의 gameId를 캡처해야 하므로(createSelfDisconnectHandler
  // 참고) 구독 대상으로 필요하다 — game_ended/phase_changed 핸들러는 호출 시점에 store를
  // 직접 다시 읽으므로 이 값에 의존하지 않는다.
  const gameId = useInGameStore((s) => s.gameId)
  // F-23(AC-05/SPLIT-1): 계정·소속 축이 바뀌면 이 구독도 **현재 범위로 다시** 등록한다.
  // 그러지 않으면 전이 뒤에도 옛 범위의 콜백만 남아, 새 신원의 정상 사건까지 거부된다.
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  // F-23(AC-05/SPLIT-1): 실제 "connect" 세대. 같은 Socket 객체의 재연결은 위 socket 참조도
  // 계정·소속 축도 바꾸지 않으므로, 이 값이 없으면 구독은 옛 socket.id를 등록 문맥으로 계속
  // 들고 있게 된다 — 그 문맥은 재연결 이후의 정상 사건을 전부 거부한다.
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => {
      setConnectSeq((current) => current + 1)
      // F-26b(AC-02): 같은 소켓 객체의 재연결도 이전 연결이 수락한 밤 성공 사건 기록(큐·수락
      // eventId·ACK 표식)을 취소해야 한다 — ingameStore는 소켓에 직접 리스너를 걸지 않으므로
      // (다른 기능의 리스너 집합을 늘리지 않기 위해서다), 이미 connect를 구독하는 이 effect가
      // 그 사실을 store에 전달한다.
      noteInGameConnectionRebound()
    }
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  useEffect(() => {
    if (!socket) return
    // 이 구독이 등록된 그 순간의 범위. 아래 공개 결과·개인 결과·참여 변경 핸들러는 사건이
    // 도착할 때마다 이 값과 현재를 대조한다 — effect 정리가 아직 돌지 않은 구간에 옛 연결·
    // 옛 계정의 사건이 canonical 사망·참여·종료를 저장하지 못하게 한다.
    const registeredScope = currentReceiptScope()
    const finalize = buildFinalizer(navigate)
    const handleGameEnded = createGameEndedHandler({
      // 클로저로 렌더 시점 gameId를 캡처하지 않고, 이벤트가 실제로 도착한 시점에
      // store에서 최신 gameId를 읽는다 — stale(늦게 도착한 이전 세션) game_ended가
      // 그 사이 시작된 새 GameSession을 잘못 지우는 것을 막는다.
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })
    // ROLE_REVEAL→NIGHT 전이 방송이다. game_ended와 같은 이유로 이 effect 안에서 함께
    // 구독한다 — /ingame 마운트 시점에만 구독하면 그 전(라우트 전환 중)에 도착하는
    // 이벤트를 놓칠 수 있다. applyPhaseChanged 자체가 gameId 불일치를 걸러내므로 여기서는
    // store에 그대로 위임한다.
    const handlePhaseChanged = (payload) => {
      // F-23(AC-05 보수): 같은 effect의 다른 공개 사건 핸들러와 **똑같이** 등록 범위를 먼저
      // 본다. 단계 전이는 그 자체로 밤·낮·재판의 입력 창을 여닫는 공개 사실이라, 재연결·신원
      // 전이 직후 effect 재등록 전 구간에서 옛 소켓·옛 신원의 구독이 늦게 받은 것을 현재
      // store에 실으면 지금 판의 단계가 지나간 판의 사실로 덮인다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const before = useInGameStore.getState().state
      useInGameStore.getState().applyPhaseChanged(payload)
      const after = useInGameStore.getState()
      // store가 참조를 그대로 돌려줬다면(stale·중복·형식 오류) 실제 전이가 아니다 — 소리도 없다.
      if (after.state === before) return
      playGameSfx(
        "game-phase-changed",
        `game:${after.gameId}:phase:${after.state.phase}:${after.state.dayIndex}`,
        after.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    // NIGHT 결과 적용(사망 + DAY 전이) 방송이다. 검증에 필요한 canonical roster/gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(렌더 시점 클로저를 캡처하지 않음 — 위 handleGameEnded와
    // 동일한 이유). 파서를 통과한 값만 store action으로 넘긴다.
    const handleNightResultApplied = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const canonicalPlayerIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const previouslyDeadUuids = new Set((current.state.players ?? []).filter((p) => p.alive === false).map((p) => p.uuid))
      const parsed = parseNightResultAppliedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        canonicalPlayerIds,
        previouslyDeadUuids,
      })
      if (!parsed) return
      // F-23(SPLIT-1): 이 판정이 승패를 확정할 수 있다 — 그 종료 결과가 **누가·어느 연결에서**
      // 받은 것인지를 store가 함께 적어 두도록 지금 이 순간의 수신 범위를 넘긴다. 그래야 뒤이은
      // 재결속 스냅샷 실패가 이 연결이 직접 받은 결과까지 걷어내지 않고, 반대로 인증이 왕복한
      // 뒤의 옛 결과는 현재 범위로 통과하지 못한다.
      useInGameStore.getState().applyNightResultAppliedPayload(parsed, currentReceiptScope())
      // 밤 결과로 승패가 확정될 수 있다. 사망 자체의 공개음은 player_eliminated가 담당하고,
      // 여기서는 종료 전이만 결과음으로 잇는다(두 사건의 ID는 서로 다르다).
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    // 밤 개인 결과(night_action_result)다. 세션 channel 방송이 아니라 결과가 있는 수신자
    // 소켓에게만 개별 emit되는 1회성 통지이고, payload에는 수신자 identity가 없다 — 그래서
    // 본인 확인은 서버가 그 결과를 만들 수 있는 수신자 조건(역할·생존·대상≠본인) 전부와
    // 대조해서 한다(parseInGameNightPrivateResultPayload).
    // 검증에 필요한 gameId/dayIndex/phase/self는 호출 시점의 store에서 직접 읽는다(위
    // handleNightResultApplied와 동일한 이유 — 렌더 시점 클로저를 캡처하지 않는다).
    const handleNightActionResult = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseInGameNightPrivateResultPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        phase: current.state.phase,
        selfRole: current.state.self?.role ?? null,
        selfUuid: current.state.self?.uuid ?? null,
        // 생존은 roster가 유일한 canonical 출처다(self에는 alive가 없다 — selectInGameSelfAlive).
        selfAlive: selectInGameSelfAlive(current.state),
      })
      if (!parsed) return
      useInGameStore.getState().setNightPrivateResult(parsed)

      // F-16(AC-05): 개인 결과음. 서버가 이 결과를 보낼 수 있는 수신자 조건 전부를 위
      // 파서가 이미 대조했고, 여기서는 서버가 명시한 허용 계정과 현재 인증 계정을 한 번 더
      // 대조한다 — 둘 다 통과해야 소리가 난다. 봉투가 없으면 무음이다.
      //
      // ASSASSINATE success:false는 "실패 통지"이지 성공이 아니다 — 별도 kind로 보낸다.
      // 대상 uuid·조사로 드러난 역할은 ID에도 재생기 입력에도 넣지 않는다.
      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      const accountId = currentAccountId()
      if (accountId === null || envelope.accountId !== accountId) return
      if (envelope.gameId !== current.gameId) return
      const kind = parsed.actionType === "ASSASSINATE" ? "night-private-failure" : "night-private-result"
      playGameSfx(kind, envelope.eventId, current.gameId, envelope.origin ?? "restore")
    }

    // DAY 투표 판정 방송이다(TRIBUNAL 전이 또는 TIE/ABSTAINED의 NIGHT 전이). 검증에 필요한
    // gameId/dayIndex는 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    const handleDayVoteResolved = (payload) => {
      // F-23(AC-05 보수): 위 공개 사건 핸들러들과 **똑같은** 등록 범위 가드다. 낮 판정은 재판
      // 진입(피고 확정)과 다음 밤 전이를 함께 확정하므로, 옛 연결·옛 신원의 구독이 늦게 받은
      // 판정이 현재 화면의 단계와 피고를 바꾸지 못하게 한다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayVoteResolvedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore
        .getState()
        .applyDayVoteResolvedToPhase(current.gameId, parsed.dayIndex, {
          ...parsed,
          outcome: parsed.outcome,
          defendantUuid: parsed.tribunalTargetUuid,
        })

      // 낮 판정음. 제출(ACK)과 판정(방송)은 서로 다른 kind이고, 한 (게임, 날짜, 라운드)는
      // 정확히 한 번 판정되므로 중복 방송은 같은 ID로 걸러진다. round가 없는 legacy payload는
      // 1라운드다(parseDayVoteRoundFields와 같은 기본값).
      const round = Number.isInteger(parsed.round) ? parsed.round : 1
      playGameSfx(
        "day-vote-resolved",
        `game:${current.gameId}:day:${parsed.dayIndex}:round:${round}:day-resolved`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    // 낮 하위 페이즈 전이(DAY_DISCUSSION→DAY_VOTE) 방송이다. 검증에 필요한 gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    const handleDayPhaseChanged = (payload) => {
      // F-23(AC-05 보수): 위 공개 사건 핸들러들과 **똑같은** 등록 범위 가드다. 낮 하위 페이즈는
      // 투표 입력 창 자체를 여는 공개 사실이라, 지나간 범위의 구독이 늦게 받은 전이가 현재
      // 화면의 투표 단계를 열거나 닫게 두지 않는다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseDayPhaseChangedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyDayPhaseChanged(parsed)
      playGameSfx(
        "day-phase-changed",
        `game:${current.gameId}:day:${parsed.dayIndex}:dayphase:${parsed.dayPhase}`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    // 밤 역할 턴 전이(어느 직업의 차례가 시작됐는가) 방송이다. 검증에 필요한 gameId/dayIndex는
    // 호출 시점의 store에서 직접 읽는다(위 handleNightResultApplied와 동일한 이유).
    //
    // 이 구독은 역할·생존과 무관하게 모든 참가자에게 똑같이 걸린다 — 서버도 생존자가 없는
    // 역할의 턴을 똑같이 돌리고 같은 payload를 세션 channel 전체에 방송하므로, 여기서 역할별·
    // 생존별로 나눠 구독하면 죽은 직업의 턴 안내만 조용히 사라진다.
    const handleNightTurnStarted = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnStartedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnStarted(parsed)
      // 이 방송은 역할·생존과 무관하게 모든 참가자에게 똑같이 간다(위 주석 참고). 턴 전환
      // 안내음도 마찬가지라, 여기서 역할별로 소리를 나누지 않는다 — role은 이미 공개된
      // "지금 누구의 차례인가"이지 개인 비밀이 아니다.
      playGameSfx(
        "night-turn-started",
        `game:${current.gameId}:day:${parsed.dayIndex}:nightturn:${parsed.role}`,
        current.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
    }

    // 서버가 현재 역할 턴의 종료를 확정한 순간 role/deadline을 함께 비운다. 다음 started가
    // 오기 전의 공백도 서버 상태의 일부이므로 이전 역할을 로컬에서 유지하거나 추정하지 않는다.
    const handleNightTurnEnded = (payload) => {
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const parsed = parseNightTurnEndedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        nightTurnRole: current.state.nightTurnRole,
      })
      if (!parsed) return
      useInGameStore.getState().applyNightTurnEnded(parsed)
    }

    const detachNightTurnListeners = attachNightTurnSocketListeners(socket, {
      onStarted: handleNightTurnStarted,
      onEnded: handleNightTurnEnded,
    })

    // TRIBUNAL 판정 완료 방송이다. 위 세 핸들러와 달리 별도 파서를 거치지 않고 raw payload를
    // 그대로 store에 넘긴다 — applyTribunalResolved(→applyTribunalResolvedPure)가 gameId/
    // dayIndex/phase/defendantUuid 4종을 canonical과 비교해 stale이면 참조를 그대로 보존한다.
    const handleTribunalVoteResolved = (payload) => {
      // F-23(AC-05 보수): handleNightResultApplied·handleParticipationChanged와 **똑같이**
      // 등록 범위를 먼저 본다. 재판 판정은 사망과 승패를 함께 확정하는 공개 사건이라, 교체되기
      // 전 옛 소켓·옛 신원의 구독이 늦게 받은 것을 지금 화면(종료 결과 포함)에 실으면 안 된다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const before = useInGameStore.getState().state
      // 유죄 판정도 승패를 확정할 수 있다 — 위 handleNightResultApplied와 같은 이유로 수신
      // 범위를 함께 넘긴다.
      useInGameStore.getState().applyTribunalResolved(payload, currentReceiptScope())
      const after = useInGameStore.getState()
      // applyTribunalResolved는 stale payload에 참조를 그대로 보존한다 — 그 경우 소리도 없다.
      if (after.state === before || !after.gameId || !after.state) return
      playGameSfx(
        "tribunal-vote-resolved",
        `game:${after.gameId}:day:${after.state.dayIndex}:tribunal-resolved`,
        after.gameId,
        payload?.sfxEvent?.origin ?? payload?.origin ?? "live",
      )
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    /**
     * F-16(AC-01): player_eliminated의 **누락돼 있던** 프런트 소비처다.
     *
     * 서버는 끊김 유예 만료(expireDisconnectGrace)에서 이 사건을 이미 방송하고 있었는데
     * 받는 쪽이 하나도 없어서, 그 사망이 다른 참가자 화면의 roster에 반영되지 않았다.
     * 여기서 검증 → store 반영 → 소리 순서로 잇는다. 이것은 이미 발생하는 현재 사건의
     * 보완이며 종료 흐름 개편(F-22)이 아니다.
     */
    const handlePlayerEliminated = (payload) => {
      // F-23(AC-05 보수): 위 공개 사건 핸들러들과 **똑같이** 등록 범위를 먼저 본다. 끊김 사망도
      // 곧바로 승패를 확정할 수 있으므로, 옛 연결·옛 신원의 구독이 늦게 받은 사망 사건이 현재
      // 화면의 canonical roster와 종료 결과를 바꾸지 못하게 한다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      const current = useInGameStore.getState()
      if (!current.gameId || !current.state) return
      const players = current.state.players ?? []
      const canonicalPlayerIds = new Set(players.map((p) => p.uuid))
      const previouslyDeadUuids = new Set(players.filter((p) => p.alive === false).map((p) => p.uuid))
      const parsed = parsePlayerEliminatedPayload({
        payload,
        gameId: current.gameId,
        dayIndex: current.state.dayIndex,
        phase: current.state.phase,
        canonicalPlayerIds,
        previouslyDeadUuids,
      })
      if (!parsed) return

      const before = current.state
      // 끊김 사망도 곧바로 승패를 확정할 수 있다 — 위 두 핸들러와 같은 이유로 수신 범위를 넘긴다.
      useInGameStore.getState().applyPlayerEliminated(parsed, currentReceiptScope())
      // 중복 방송이면 reducer가 참조를 그대로 돌려준다 — 이미 반영된 사망에 소리를 더하지 않는다.
      if (useInGameStore.getState().state === before) return

      // 사망 사건과 결과 사건은 ID가 다르다. 끊김 사망이 곧바로 승패를 확정한 경우에는
      // 둘 다 한 번씩 난다.
      const envelope = payload?.sfxEvent
      const eventId =
        envelope !== null && typeof envelope === "object" && typeof envelope.eventId === "string"
          ? envelope.eventId
          : `game:${current.gameId}:day:${parsed.dayIndex}:victim:${parsed.victimUuid}:eliminated`
      playGameSfx("player-eliminated", eventId, current.gameId, envelope ? (envelope.origin ?? "restore") : "live")
      dispatchResultSfxIfEnded(payload?.sfxEvent?.origin ?? payload?.origin ?? "live")
    }

    /**
     * F-26b(AC-01/AC-02/AC-03): 역할별 성공 사건(night_action_success) 개인 수신. F-26a가
     * 개별 emit하는 사건이라 등록 범위를 다른 공개 사건과 똑같이 먼저 본다 — 옛 연결·옛 신원의
     * 구독이 늦게 받은 사건이 현재 화면의 대기 큐에 들어가면 안 된다. 형태·게임/밤 일치·본인
     * 신원 재확인은 store의 receiveNightSuccess가 소유한다(다른 apply* 액션과 같은 분담).
     */
    const handleNightActionSuccess = (payload) => {
      if (!isRegistrationScopeCurrent(registeredScope)) return
      useInGameStore.getState().receiveNightSuccess(payload, currentReceiptScope())
    }

    /**
     * F-21(AC-03/AC-05): 참여 상태 변화 공개 방송. 생존(player_eliminated)·단계
     * (game_phase_changed)와 **분리된** 사실이라 별도 reducer가 소유한다. 형태·게임 일치·
     * 세대 단조성 검증은 전부 store가 하므로 여기서는 그대로 넘긴다. 소리는 없다 — 이 사건은
     * 사망도 전이도 아니다.
     */
    const handleParticipationChanged = (payload) => {
      // F-23(SPLIT-1): 참여 변경은 소속 그 자체를 말하는 사건이다 — 등록 당시와 다른 신원·
      // 다른 연결에서 온 것이면 지금 화면의 참여 상태를 바꿀 근거가 되지 않는다.
      if (!isRegistrationScopeCurrent(registeredScope)) return
      useInGameStore.getState().applyParticipationChanged(payload)
    }

    /**
     * F-21(AC-03): 이탈로 **내 표가 기권으로 정규화**됐다는 개인 전송. 공개 방송과 나눈 이유는
     * 내용이 비밀이기 때문이다(누가 누구를 찍었는지를 채널에 실을 수 없다).
     *
     * 이 사건은 그 자리에서 **현재 인증 계정의 것**이어야 한다 — 개인 전송이지만 계정 전환
     * 중에 도착할 수 있고, 그때 반영하면 남의 제출 상태가 지금 화면에 남는다. 게임·세대 검증은
     * store가 소유한다. 소리는 없다(제출도 전이도 아니다).
     */
    const handleSelfProgress = (payload) => {
      if (currentAccountId() === null) return
      useInGameStore.getState().applySelfProgress(payload)
    }

    /**
     * F-21(AC-02): 방장이 나를 내보냈다. 이 수신기는 ProtectedRoute에 장착돼 라우트와 무관하게
     * 계속 살아 있으므로, 사건이 **지금 이 화면의 것인지**를 직접 판정해야 한다.
     *
     *   - 인증 계정이 대상인가(공개 방송이 아니라 개인 전송이지만, 계정 전환 중에 도착할 수 있다)
     *   - 그 게임/방이 지금 내가 들고 있는 것인가
     *
     * 둘 다 맞을 때만 그 상태를 비우고 로비로 보낸다. 새 게임이나 다른 방은 건드리지 않는다.
     */
    const handleGameKicked = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      const accountId = currentAccountId()
      if (accountId === null || payload.targetUuid !== accountId) return
      // 판정은 store가 소유한 canonical 적재값으로만 한다 — 게임·방 인스턴스·서버 기동·내
      // 소속이 전부 맞아야 한다(대기방 추방과 같은 계약).
      if (!isCurrentGameKickEvent(useInGameStore.getState(), payload)) return
      // **그 게임만** 비운다. 진행 중 추방은 대기방을 끝내는 사건이 아니다 — 공용 finalize는
      // matching store까지 함께 지우므로, 이 계정이 그 사이 새 대기방에 들어가 있었다면
      // (추방 뒤 로비로 돌아가 방에 참가했는데 옛 사건이 늦게 도착하는 경우) 방금 성립한
      // 새 소속이 옛 게임 사건 하나로 화면에서 사라진다.
      useInGameStore.getState().clearGame()
      // 이동도 **그 게임의 화면일 때만** 한다. 지우는 범위를 그 게임으로 좁혀 놓고 이동은
      // 무조건 하면, 새 대기방을 보고 있던 사용자가 옛 게임 사건 하나로 그 화면에서 쫓겨난다
      // (상태는 남았는데 화면만 로비인 어긋남이다). 그 사이 성립한 새 대기방 소속이 있으면
      // 그 화면이 지금 사용자가 있는 곳이므로 그대로 둔다.
      if (useMatchingStore.getState().isInRoom) return
      // clearGame 이후 같은 사건이 다시 전달돼도 위 판정이 실패하므로 이동은 한 번뿐이다.
      navigate("/multiplay", { replace: true })
    }

    /**
     * F-21(AC-02/AC-05/AC-06): 방장이 **대기방에서** 나를 내보냈다.
     *
     * 판정은 matchingStore의 canonical 적재값으로만 한다(isCurrentRoomKickEvent) — 방·방
     * 인스턴스·서버 기동·내 소속이 전부 맞아야 한다. 하나라도 빼면 같은 방에 다시 들어온 뒤
     * 도착한 옛 사건이 방금 성립한 새 소속을 지운다.
     *
     * 지우는 것은 **그 방뿐이다.** 대기방 추방은 게임을 끝내지 않으므로 인게임 store를
     * 건드리지 않는다(시작 커밋이 먼저 일어난 경우 그 게임은 이 사건의 소유가 아니다).
     */
    const handleRoomKicked = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      const accountId = currentAccountId()
      if (accountId === null || payload.targetUuid !== accountId) return
      if (!isCurrentRoomKickEvent(useMatchingStore.getState(), payload)) return
      useMatchingStore.getState().clearRoom()
      // handleGameKicked와 대칭이다 — 시작 커밋이 먼저 끝나 이미 인게임 화면에 있는데 옛
      // 대기방 사건이 늦게 도착하면, 그 방 상태만 비우고 진행 중인 판의 화면은 그대로 둔다.
      if (useInGameStore.getState().gameId !== null) return
      // clearRoom 이후 같은 사건이 다시 전달돼도 위 판정이 실패하므로 이동은 한 번뿐이다.
      navigate("/multiplay", { replace: true })
    }

    /**
     * F-21(A-10): 전적이 실제로 커밋된 뒤 서버가 보내는 개인 신호다. 게임 상태는 전혀 건드리지
     * 않고(복원도 이동도 하지 않는다) 계정 캐시만 다시 읽게 한다 — 먼저 추방·이탈해 로비에
     * 있는 계정도 이 신호를 받는다(현재 경기 채널 가입 여부는 조건이 아니다).
     *
     * payload에는 gameId와 무효화 종류만 있다. 여기서 승패·역할을 추론하지 않는다.
     */
    const handleAccountCacheInvalidated = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      // 실제 재조회는 각 store가 소유한다 — 이 수신기는 "다시 읽어라"를 전달만 한다.
      requestAccountCacheRefresh(payload.scopes, { invalidate: true })
    }

    socket.on("game_ended", handleGameEnded)
    socket.on("player_eliminated", handlePlayerEliminated)
    socket.on("session_participation_changed", handleParticipationChanged)
    socket.on("session_self_progress", handleSelfProgress)
    socket.on("game_kicked", handleGameKicked)
    socket.on("room_kicked", handleRoomKicked)
    socket.on("account_cache_invalidated", handleAccountCacheInvalidated)
    socket.on("game_phase_changed", handlePhaseChanged)
    socket.on("night_result_applied", handleNightResultApplied)
    socket.on("night_action_result", handleNightActionResult)
    socket.on("night_action_success", handleNightActionSuccess)
    socket.on("day_vote_resolved", handleDayVoteResolved)
    socket.on("day_phase_changed", handleDayPhaseChanged)
    socket.on("tribunal_vote_resolved", handleTribunalVoteResolved)
    return () => {
      socket.off("game_ended", handleGameEnded)
      socket.off("player_eliminated", handlePlayerEliminated)
      socket.off("session_participation_changed", handleParticipationChanged)
      socket.off("session_self_progress", handleSelfProgress)
      socket.off("game_kicked", handleGameKicked)
      socket.off("room_kicked", handleRoomKicked)
      socket.off("account_cache_invalidated", handleAccountCacheInvalidated)
      socket.off("game_phase_changed", handlePhaseChanged)
      socket.off("night_result_applied", handleNightResultApplied)
      socket.off("night_action_result", handleNightActionResult)
      socket.off("night_action_success", handleNightActionSuccess)
      socket.off("day_vote_resolved", handleDayVoteResolved)
      socket.off("day_phase_changed", handleDayPhaseChanged)
      detachNightTurnListeners()
      socket.off("tribunal_vote_resolved", handleTribunalVoteResolved)
    }
  }, [socket, navigate, authUuid, identityGeneration, identityScopeVersion, connectSeq])

  /**
   * F-21(AC-03/A-10): **신호를 못 받았을 수 있는 전이**에서 계정 캐시를 서버 값으로 수렴시킨다.
   *
   * 개인 무효화(account_cache_invalidated)는 그 순간 연결돼 있는 소켓으로만 간다. 끊겨 있는
   * 동안 커밋된 전적, 다른 탭·다른 창에서 지나간 신호, 웹 프로세스 밖의 복구 작업
   * (backfill-achievements CLI는 웹서버의 onlineUsers를 공유하지 않는다)은 이 브라우저에
   * 도달하지 않는다. 그래서 세 가지 전이에서 한 번씩 다시 읽는다.
   *
   *   - 재연결(connect): 끊겨 있던 구간에 지나간 사실을 여기서 확인한다.
   *   - 창 재활성화(focus) · 탭 가시화(visibilitychange → visible): 다른 곳에서 일어난 커밋과
   *     별도 프로세스의 복구 지급을 확인한다.
   *
   * 이 훅은 ProtectedRoute에 장착돼 로비·상점·서고·마이페이지 어디에 있든 살아 있으므로,
   * 먼저 추방·이탈해 경기 채널에 없는 계정도 같은 수렴을 받는다. 게임 상태는 건드리지 않고
   * 어떤 화면 이동도 하지 않는다(게임 복원은 이 경로의 책임이 아니다).
   */
  useEffect(() => {
    // 로그인하지 않았으면 읽을 계정이 없다. socket이 아직 없어도 창 전이는 구독한다 —
    // 연결 없이 열어 둔 화면도 재활성화 시 HTTP 조회로 수렴할 수 있어야 한다.
    const refresh = () => requestAccountCacheRefresh(ACCOUNT_CACHE_SCOPES)

    const handleVisibility = () => {
      if (typeof document === "undefined") return
      if (document.visibilityState !== "visible") return
      refresh()
    }

    if (socket) socket.on("connect", refresh)
    if (typeof window !== "undefined") window.addEventListener("focus", refresh)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      if (socket) socket.off("connect", refresh)
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [socket])

  useEffect(() => {
    // 활성 GameSession이 없으면(gameId 없음) disconnect가 와도 정리할 것이 없다 — 로비 등
    // 인게임 밖에서 발생하는 일반적인 재연결까지 이 경로가 반응할 필요는 없다.
    if (!socket || !gameId) return
    const finalize = buildFinalizer(navigate)
    const handleSelfDisconnect = createSelfDisconnectHandler({
      getActiveSocket: getSocket,
      registeredSocket: socket,
      registeredGameId: gameId,
      getCurrentGameId: () => useInGameStore.getState().gameId,
      finalize,
    })

    socket.on("disconnect", handleSelfDisconnect)
    return () => socket.off("disconnect", handleSelfDisconnect)
  }, [socket, gameId, navigate])
}
