// 파일 역할: ingameStore.js - 전역 상태 store입니다.
import { create } from "zustand"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { applyTribunalResolvedPure } from "./applyTribunalResolved.js"
import { applyPlayerEliminatedPure } from "./applyPlayerEliminated.js"
import { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "./applySessionSnapshot.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../utils/dayVoteRound.js"

// 밤 역할 턴을 "아직 아무 턴도 방송되지 않음"으로 되돌리는 패치. 밤을 벗어나거나 새 밤에
// 들어갈 때마다 같은 두 필드를 함께 비우기 위해 한 곳에 모아둔다 — 한쪽만 비우면 역할과
// 남은 시간이 서로 다른 턴을 가리키게 된다.
const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// NIGHT에 새로 들어갈 때 개인 결과를 함께 비우는 패치. nightPrivateResult는 "지난 밤의 내
// 조사/확인/암살 통지"라, 새 밤이 시작되면 반드시 사라져야 한다(그러지 않으면 지난 밤 결과가
// 이번 밤 오버레이로 다시 뜬다). CLEARED_NIGHT_TURN과 같은 이유로 한 곳에 모아둔다.
const CLEARED_NIGHT_PRIVATE_RESULT = Object.freeze({ nightPrivateResult: null })

/**
 * "밤이 아니었다가 밤이 됐다"(NIGHT 재진입)일 때만 개인 결과를 비우는 패치를 돌려준다.
 *
 * 같은 NIGHT 안에서 반복 관측되는 이벤트(중복 방송)나 재접속 스냅샷 복원은 재진입이 아니다 —
 * 그런 경로로 값이 사라지면 아직 확인하지 않은 개인 결과가 조용히 유실된다. 그래서 판단
 * 기준은 오직 "직전 canonical phase가 NIGHT이 아니었는가" 하나다.
 */
function clearNightPrivateResultOnNightEntry(current) {
  return current.state?.phase === "NIGHT" ? null : CLEARED_NIGHT_PRIVATE_RESULT
}

// ───────────────────────────────────────────────────────────────────────────
// F-23(AC-05/AC-06/SPLIT-1/SPLIT-2): **지금 이 화면의 신원 범위**
//
// 이 store가 소유하는 "범위"는 두 축으로 나뉜다. 둘을 한 값으로 뭉치면 둘 중 하나는 반드시
// 틀린 쪽으로 새어 나간다.
//
//   1. 계정/소속 축 — gameId · 이 세션이 말하는 본인(state.self.uuid) · 그 본인의
//      membershipId · 그 셋이 실제로 바뀐 횟수(membershipEpoch).
//      값 비교만으로는 같은 판의 이탈→재입장(A→B→A)을 구별할 수 없다. 값이 원래대로
//      돌아오기 때문이다 — 전이 **횟수**만이 그 구간을 드러낸다. zustand의 구독은 set마다
//      동기적으로 불리므로, 같은 React 배치 안의 A→B→A도 두 전이로 남는다.
//
//   2. 연결 축 — 소켓 객체 세대(socketEpoch) · 실제 connect/disconnect 세대(connectEpoch) ·
//      그 순간의 socket.id. 같은 Socket 객체가 재연결되면 객체 동일성은 유지되고 id만 바뀐다.
//
// 화면 선택(사망 후 계속 보기)은 1번 축에만 묶이고(연결이 끊겼다고 다시 묻지 않는다), 공개
// 결과의 **수신 증거**는 두 축 모두에 묶인다(다른 연결에서 받은 것은 이 연결의 사실이 아니다).
//
// 소켓 **객체 참조**는 이 모듈 안에만 둔다 — store 상태 트리에 넣으면 직렬화도 순회도 불가능한
// 값이 들어가고, 그 아래로 감사가 지나갈 수 없다. 상태에 남기는 것은 세대 수와 id 문자열뿐이다.
// ───────────────────────────────────────────────────────────────────────────

/** 이 세션이 말하는 본인의 소속 식별자. 본인을 모르면 null이다. */
function readSelfMembershipId(state) {
  const me = state?.self?.uuid ?? null
  if (!me) return null
  return (state?.players ?? []).find((player) => player?.uuid === me)?.membershipId ?? null
}

let membershipEpoch = 0
let observedGameId
let observedSelfUuid
let observedMembershipId

let identityScopeVersion = 0
const identityScopeListeners = new Set()

/**
 * 계정/소속 축의 전이를 한 번 기록한다. 실제로 바뀐 경우에만 세대가 오르고, 그 세대는
 * **단조**다 — clearGame으로도 0으로 되돌리지 않는다(되돌리면 그 사이에 날아간 옛 요청이
 * 다시 현재처럼 보인다).
 *
 * 같은 전이를 두 번 세지 않는다: 스냅샷 적용처럼 자기 커밋 안에서 먼저 기록한 전이는 그
 * 직후 store 구독자가 같은 값을 다시 관측하므로 변화가 없어 그대로 지나간다.
 */
function adoptIdentityScope(gameId, state) {
  const selfUuid = state?.self?.uuid ?? null
  const membershipId = readSelfMembershipId(state)
  if (observedGameId === gameId && observedSelfUuid === selfUuid && observedMembershipId === membershipId) {
    return membershipEpoch
  }
  observedGameId = gameId
  observedSelfUuid = selfUuid
  observedMembershipId = membershipId
  membershipEpoch += 1
  identityScopeVersion += 1
  for (const listener of [...identityScopeListeners]) listener()
  return membershipEpoch
}

/**
 * 계정/소속 축이 바뀔 때마다 오르는 단조 값. useSyncExternalStore의 getSnapshot으로 그대로
 * 쓸 수 있도록 원시값을 돌려준다(같은 범위에서는 몇 번을 물어도 같은 값이다).
 */
export function getInGameIdentityScopeVersion() {
  return identityScopeVersion
}

export function subscribeInGameIdentityScope(listener) {
  identityScopeListeners.add(listener)
  return () => identityScopeListeners.delete(listener)
}

// ── 연결 축 관측(모듈 수명에서 한 벌) ────────────────────────────────────────
//
// React 컴포넌트가 아니라 모듈이 소유한다. StrictMode의 setup→cleanup→setup은 컴포넌트의
// 일이므로 이 관측을 다시 만들지 않고, 따라서 그것만으로 세대가 오르지 않는다.
//
// 연결 수명은 **소켓 자체에 리스너를 걸지 않고** 읽는다. 걸어야 할 이유가 없기 때문이다:
// 한 연결을 다른 연결과 가르는 값이 이미 소켓 안에 있다(교체는 객체 참조, 재연결은 새 id,
// 끊김은 connected=false — socket.io는 재연결마다 새 sid를 발급하고 끊길 때 id를 지운다).
// 세 값을 요청 시점과 응답 시점에 그대로 비교하면 "다른 연결에서 받은 증거"는 전부 걸린다.
// 대신 이 모듈이 다른 기능의 리스너 집합을 늘리지 않으므로, 같은 소켓을 쓰는 화면들의
// "자기 리스너만 해제한다"는 기존 계약을 한 줄도 건드리지 않는다.
const NO_SOCKET_OBSERVED = Symbol("no-socket-observed")
let socketEpoch = 0
let observedSocket = NO_SOCKET_OBSERVED

function rebindConnectionScope() {
  const next = getSocket() ?? null
  if (observedSocket === next) return
  observedSocket = next
  // 객체가 바뀌면 연결 수명도 새로 열린다 — 옛 연결에서 받은 증거는 여기서 끊긴다.
  socketEpoch += 1
}

subscribeSocket(rebindConnectionScope)
rebindConnectionScope()

/**
 * 요청을 **보내는 그 순간**의 범위를 한 벌로 캡처한다.
 *
 * 계정 축(accountId·identityGeneration)은 이 store가 읽을 수 없으므로 호출부(인증을 아는 훅)가
 * 넣어 준다. 나머지는 전부 이 모듈이 소유한 관측에서 읽는다 — 요청 시점과 응답 시점이 같은
 * 함수를 쓰므로 판정 기준이 갈리지 않는다.
 */
export function readInGameReceiptScope({ accountId = null, identityGeneration = null } = {}) {
  const { gameId, state } = useInGameStore.getState()
  const socket = getSocket()
  return {
    accountId,
    identityGeneration,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch,
    socketId: socket?.id ?? null,
    socketConnected: socket?.connected === true,
  }
}

/** 두 범위가 모든 축에서 같은가. 하나라도 없거나 다르면 false다(fail-closed). */
export function isSameInGameReceiptScope(a, b) {
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false
  return a.accountId === b.accountId
    && a.identityGeneration === b.identityGeneration
    && a.gameId === b.gameId
    && a.membershipId === b.membershipId
    && a.membershipEpoch === b.membershipEpoch
    && a.socketEpoch === b.socketEpoch
    && a.socketId === b.socketId
    && a.socketConnected === b.socketConnected
}

/**
 * 적용 직전에 이 store가 소유한 축만 다시 맞춰 본다(계정 축은 인증을 아는 호출부가 응답
 * 직전에 같은 기준으로 확인하고, 그 값은 아래 소유권에 그대로 기록된다).
 *
 * @param {object} current set() updater가 받은 **아직 커밋되지 않은** 현재 상태.
 */
function isReceiptScopeCurrent(receipt, current) {
  if (receipt === null || typeof receipt !== "object") return false
  if (receipt.gameId !== (current.gameId ?? null)) return false
  if (receipt.membershipId !== readSelfMembershipId(current.state)) return false
  if (receipt.membershipEpoch !== membershipEpoch) return false
  if (receipt.socketEpoch !== socketEpoch) return false
  if (receipt.socketId !== (getSocket()?.id ?? null)) return false
  if (receipt.socketConnected !== (getSocket()?.connected === true)) return false
  return true
}

/**
 * F-23(AC-05): 응답이 **다른 소속의 것**인가.
 *
 * 스냅샷 응답은 자기가 어느 소속의 자리에서 만들어졌는지를 roster의 membershipId로 말한다.
 * 지금 화면이 이미 소속을 알고 있는데(non-null) 응답이 그와 **다른 소속**을 주장하면, 그것은
 * 같은 판·같은 계정이라도 이 화면이 앉아 있는 자리의 사실이 아니다 — 이탈→재입장으로 생긴
 * 다른 참여 기록이거나, 그 전이 구간을 지나온 응답이다. 그런 응답을 현재 복원 권위로
 * 승격하면 adoptIdentityScope가 남의 소속을 관측 기준으로 채택하고 buildSnapshotResultOwner가
 * 거기에 공개 결과의 수신 증거까지 붙여 준다(승인된 복원 권위 계약 위반).
 *
 * **모른다고 말하는 응답은 다르다고 말하는 응답이 아니다.** membershipId를 싣지 않는 구버전
 * 스냅샷은 값을 주장하지 않으므로 여기서 막지 않는다(기존 호환 계약 그대로). 현재 소속이
 * 아직 null인 화면의 정상 보충(null→X)도 막지 않는다 — 그것이 이 값이 처음 채워지는 경로다.
 */
function claimsForeignMembership(current, nextState) {
  const currentMembershipId = readSelfMembershipId(current.state)
  if (currentMembershipId === null) return false
  const nextMembershipId = readSelfMembershipId(nextState)
  if (nextMembershipId === null) return false
  return nextMembershipId !== currentMembershipId
}

/**
 * 방금 저장한 **공개 밤 결과**가 어느 신원·어느 연결에서 검증된 것인지를 기록한다.
 *
 * 이것은 서버 권한도, 영구 시청 이력도 아니다 — 이 화면이 "그 결과를 실제로 받았다"는 로컬
 * 수신 증거(provenance)일 뿐이다. 연출을 만드는 쪽은 이 증거가 지금 범위와 정확히 같을 때만
 * 큐를 만든다. 검증된 공개 결과가 없으면 증거도 없다(null).
 */
function buildSnapshotResultOwner(receipt, gameId, state, snapshotSeq) {
  if (receipt === null || typeof receipt !== "object") return null
  if (!state?.nightResult) return null
  return Object.freeze({
    accountId: receipt.accountId ?? null,
    identityGeneration: receipt.identityGeneration ?? null,
    gameId: gameId ?? null,
    membershipId: readSelfMembershipId(state),
    membershipEpoch,
    socketEpoch: receipt.socketEpoch,
    socketId: receipt.socketId,
    socketConnected: receipt.socketConnected,
    snapshotSeq,
  })
}

/**
 * F-21(AC-03): 서버가 소유하는 **본인** 제출 필드. 개인 전송과 스냅샷 복원이 같은 목록을
 * 쓰므로 한쪽만 늘어나 갈라지지 않는다(applySessionSnapshot.js의 같은 이름 상수와 짝이다).
 */
const SELF_SUBMISSION_KEYS = Object.freeze([
  "hasAcknowledgedRoleReveal",
  "isDayVoteReady",
  "hasSubmittedDayVote",
  "dayVoteTargetUuid",
  "dayVoteRound",
  "hasSubmittedTribunalVote",
])

/** 공개 진행 수의 모양 검사(두 수는 음이 아닌 정수이거나 null — NIGHT은 null이다). */
function isPublicProgressShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.kind !== "string" || value.kind.length === 0) return false
  const okCount = (n) => n === null || (Number.isInteger(n) && n >= 0)
  return okCount(value.doneCount) && okCount(value.requiredCount)
}

/**
 * F-21(AC-02/AC-05/AC-06): 진행 중 추방 사건(game_kicked)이 **지금 이 화면이 들고 있는 바로
 * 그 판의 내 소속**을 가리키는지 판정한다(순수 함수 — 어떤 상태도 바꾸지 않는다).
 *
 * matchingStore의 isCurrentRoomKickEvent와 같은 네 가지를 본다: 같은 게임 · 같은 방 인스턴스 ·
 * 같은 서버 기동 · 같은 소속. gameId 하나만 보면 다음이 전부 통과한다 — 서버 재시작 전에
 * 발행된 명령, 같은 roomId로 다시 만들어진 방의 옛 판, 나갔다 다시 들어온 같은 계정의 새
 * 소속. 서버는 이 값들을 제거 **전에** 캡처해 싣는다.
 *
 * 네 값은 **전부 있어야 하고 전부 같아야 한다**(matchingStore의 isCurrentRoomKickEvent와 같은
 * 엄격함이다). 한쪽이 없을 때 통과시키면 그 항목은 판정에서 사라지는 것과 같다 — 서버 기동
 * 식별자가 빠진 사건 하나가 재시작 전 명령을 현재 판정으로 통과시키고, 소속이 빠진 사건 하나가
 * 나갔다 다시 들어온 새 소속을 지운다. 서버는 game_started·snapshot·추방 사건 모두에 이 값들을
 * 싣는다(buildGameStartedPayload·buildSessionSnapshot·kick_game_player) — 없는 값을 관대하게
 * 봐 줄 옛 권한을 만들지 않는다.
 */
export function isCurrentGameKickEvent(store, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  const sameId = (mine, theirs) =>
    typeof mine === "string" && mine.length > 0 && mine === theirs

  if (!sameId(payload.gameId, store?.gameId)) return false

  const state = store?.state ?? null
  if (!sameId(payload.roomInstanceId, state?.roomInstanceId)) return false
  if (!sameId(payload.bootEpoch, state?.bootEpoch)) return false

  const seated = (state?.players ?? []).find((player) => player?.uuid === payload.targetUuid)
  // roster에 없는 계정에 대한 사건은 이 판의 사실이 아니다.
  if (!seated) return false
  return sameId(payload.targetMembershipId, seated.membershipId)
}

/**
 * 서버 인게임 상태를 보관하는 클라이언트 store.
 * 도메인 판정은 서버 game-core가 담당하고, 프론트는 동기화된 상태를 렌더링만 합니다.
 *
 * Room→GameSession 전환(useMatchingRoom의 game_started 핸들러가 setGamePayload를 호출)은
 * 구현됐지만, 인게임 진입 후 실시간으로 state를 갱신하는 소켓 연결(useInGameSocket)은 아직
 * 없습니다 — 게임 시작 직후 받은 초기 state(ROLE_REVEAL 단계)에서 더 이상 갱신되지 않고,
 * 화면은 그 정적인 state 위에 프리뷰(더미) 데이터를 일부 섞어 렌더링됩니다.
 */
export const useInGameStore = create((set) => ({
  gameId: null,
  state: null,
  error: null,

  // 이 게임 세션의 방장 uuid. 서버 buildGameStartedPayload에는 아직 hostUuid가 없으므로,
  // game_started를 받은 useMatchingRoom이 그 시점 matchingStore의 hostUuid를 함께 넘겨준다.
  // gameId·state와 같은 set()에서만 채워지고 clearGame이 함께 비우므로, 방장 정보는 항상
  // "지금 이 세션"에만 묶인다 — 이전 방/이전 게임의 방장이 다음 세션으로 새지 않는다
  // (useInGameSettingIsHost 참고). 스냅샷 복원 경로는 이 값을 채우지 않는다(서버가 보내지
  // 않으므로 알 수 없다 → null → 방장 아님으로 fail-closed).
  hostUuid: null,

  // get_session_snapshot 복원이 실제로 반영될 때마다 1씩 오르는 단조 카운터.
  // "이번 state 변화가 실시간 canonical 전이인가, 재접속 하이드레이션인가"를 구독자가
  // 소켓 리스너 등록 순서에 의존하지 않고 판별할 수 있게 하는 유일한 표식이다
  // (useInGamePhaseEntrance가 이 값으로 하이드레이션을 진입 연출에서 제외한다).
  // 하이드레이션이 거부되면(참조 보존 no-op) 이 값도 오르지 않는다.
  snapshotSeq: 0,

  // F-23(AC-05/SPLIT-1): 방금 복원된 **공개 밤 결과의 수신 증거**. 어느 계정·어느 소속·어느
  // 연결에서 검증한 응답으로 저장됐는지를 직렬화 가능한 세대·id로만 적어 둔다(소켓 객체
  // 참조는 들어가지 않는다). 공개 사망 연출은 이 증거가 지금 범위와 정확히 같을 때만 만든다 —
  // 그래서 이전 신분이 남긴 state.nightResult가 새 신분의 연출로 재등록되지 않는다.
  // 증거 없는 직접 적용(receipt 없이 부른 applySessionSnapshot)은 상태 호환성만 유지하고
  // 연출 증거는 만들지 않는다(null).
  snapshotResultOwner: null,

  // 이 밤에 나에게만 온 개인 결과(night_action_result). state 안이 아니라 최상위에 두는 이유는
  // canonical 세션 상태가 아니기 때문이다 — 서버 스냅샷·방송이 실어 나르는 값이 아니라 이
  // 클라이언트 한 대가 받은 1회성 통지라, state를 통째로 교체하는 스냅샷 복원이 지나가도
  // 사라지면 안 된다(applySessionSnapshotPure는 state만 만든다).
  //
  // 비워지는 시점은 정확히 셋뿐이다:
  //   1. 오버레이 확인(clearNightPrivateResult)
  //   2. NIGHT 재진입(clearNightPrivateResultOnNightEntry — 새 밤이 시작될 때)
  //   3. gameId 변경(setGamePayload / clearGame / bootstrapSessionSnapshot)
  // night_result_applied나 같은 게임의 일반 스냅샷 적용으로는 절대 비우지 않는다.
  nightPrivateResult: null,

  // F-21(AC-01/AC-03): buildGameStartedPayload가 이제 isAlive·isParticipating·membershipId·
  // hostUuid·participationRevision을 함께 내려준다. 예전에는 스토어가 "신규 세션은 전원 생존"
  // 이라고 **스스로 단정**해 players[].alive를 true로 덮어썼는데, 그 단정은 서버가 보낸 값과
  // 어긋날 수 있는 순간이 실제로 있다(시작 직후 도착한 이 payload를 늦게 적용하는 경우 등).
  // 이제는 서버 값을 그대로 쓰고, 값이 없는 구버전 payload만 예전 기본값으로 메운다.
  //
  // players[].themeIndex(표시 색상)는 반대다 — 서버가 게임당 한 번 배정해 모든 참가자에게
  // 같은 값을 내려주므로 스토어는 정규화 없이 그대로 통과시키고(아래 {...p} 스프레드),
  // 값의 유효성은 소비 지점인 buildPlayerSessionSourceFromGameState가 fail-closed로 검증한다.
  //
  // hostUuid는 이제 **서버 state.hostUuid가 유일한 원천**이다. 호출부(useMatchingRoom)가
  // 넘기는 값은 그 필드가 없는 구버전 payload를 위한 폴백으로만 남는다 — 방 단계의 복사본을
  // 권한 근거로 쓰면 새로고침 한 번에 방관리 권한이 사라지거나 옛 방장에게 남는다.
  setGamePayload: ({ gameId, state, hostUuid }) =>
    set((current) => {
      const nextGameId = gameId ?? state?.id ?? null
      const serverHostUuid = typeof state?.hostUuid === "string" && state.hostUuid.trim().length > 0
        ? state.hostUuid
        : null
      return {
        gameId: nextGameId,
        state: state
          ? {
              ...state,
              players: Array.isArray(state.players)
                ? state.players.map((p) => ({
                    ...p,
                    // 생존과 참여는 끝까지 분리된 사실이다 — 사망자도 참여 중일 수 있고,
                    // 참여가 끝난 참가자도 roster에는 남는다.
                    alive: typeof p?.isAlive === "boolean" ? p.isAlive : p?.alive !== false,
                    isParticipating: p?.isParticipating !== false,
                  }))
                : state.players,
            }
          : null,
        hostUuid: serverHostUuid
          ?? (typeof hostUuid === "string" && hostUuid.trim().length > 0 ? hostUuid : null),
        error: null,
        // F-23(AC-05): 세션 교체 경계다 — 이전 스냅샷의 수신 증거를 새 payload가 만든
        // state로 이월하지 않는다(이월하면 옛 연결에서 본 사망이 새 세션의 연출이 된다).
        snapshotResultOwner: null,
        // 개인 결과는 gameId가 실제로 바뀔 때만 비운다 — 이전 게임의 결과가 새 세션으로 넘어오는
        // 것은 막아야 하지만, 같은 게임에 대한 재적용(중복 game_started 등)까지 비우면 아직
        // 확인하지 않은 이번 밤의 결과가 조용히 사라진다("비워지는 시점은 정확히 셋" 계약).
        ...(nextGameId !== current.gameId ? CLEARED_NIGHT_PRIVATE_RESULT : {}),
      }
    }),

  // game_phase_changed 방송을 반영한다. payload는 신뢰하지 않는 외부 입력이므로 구조분해
  // 전에 형태부터 검증한다 — ROLE_REVEAL에서 나가는 canonical 전이와 정확히 일치할 때만
  // 반영하고, 그 외에는 store를 전혀 건드리지 않는다. set()에 넘긴 current를 그대로 돌려주면
  // zustand가 참조 변경 없이 완전한 no-op으로 처리한다(Object.is로 이전 state와 같은 참조인지
  // 비교해, 같으면 리스너조차 호출하지 않는다).
  //
  // 서버의 acknowledgeRoleReveal은 전원 확인이 끝나면 enterDayPhase로 첫 DAY(dayIndex 1)에
  // 진입한다 — 밤이 아니라 낮이 게임의 첫 진행 단계다(backend game-core/gameSession.js 참고).
  // 이 store는 그 canonical 전이를 그대로 비추기만 한다(판정은 하지 않는다).
  applyPhaseChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      const isFirstDay = payload.phase === "DAY" && payload.dayIndex === 1
      const isLegacyFirstNight = payload.phase === "NIGHT" && payload.dayIndex === 0
      if (!isFirstDay && !isLegacyFirstNight) return current

      // 낮은 항상 토론(DAY_DISCUSSION)부터 시작한다 — 서버 enterDayPhase가 DAY 진입 때마다
      // 하위 구간을 토론으로 초기화하는 것과 대응한다. dayPhase는 phase === "DAY"일 때만
      // 의미가 있으므로, 낮이 아닌 legacy first-night 경로에서는 null로 둔다.
      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: isFirstDay ? "DAY_DISCUSSION" : null,
        },
        // 밤으로 들어가는 경로에서만 개인 결과를 비운다(ROLE_REVEAL에서는 이미 비어 있지만,
        // "NIGHT에 들어갈 때 비운다"는 규칙을 이 경로에도 똑같이 적용해 예외를 만들지 않는다).
        ...(isLegacyFirstNight ? CLEARED_NIGHT_PRIVATE_RESULT : {}),
      }
    }),

  // F-16(AC-01): player_eliminated 공개 방송을 반영한다(끊김 사망, 그리고 그 사망이 곧바로
  // 승패를 확정한 terminal). 호출부가 parsePlayerEliminatedPayload로 이미 검증한 값만
  // 넘기지만, 다른 reducer와 같은 이유로 순수 함수 안에서 gameId/종료 불변성을 다시 본다.
  // 기존 외형 필드와 nightPrivateResult는 보존한다(applyPlayerEliminated.js 참고).
  applyPlayerEliminated: (parsed) => set((current) => applyPlayerEliminatedPure(current, parsed)),

  /**
   * F-21(AC-03/AC-05): session_participation_changed 공개 방송을 반영한다.
   *
   * 이 사건이 말하는 것은 **참여 여부와 방장뿐**이다. 생존은 player_eliminated가, 단계는
   * game_phase_changed가 각각 소유한다 — 한 사건이 여러 사실을 함께 바꾸면 그중 하나만
   * 도착한 화면이 조용히 어긋난다.
   *
   * participationRevision이 세대다. 이 사건 **이전에** 캡처된 payload가 나중에 도착해 최신
   * 참여 상태를 되돌리지 못하도록, 현재 값보다 크지 않은 revision은 완전한 no-op이다.
   * roster uuid 집합이 다르면 아예 반영하지 않는다(참가자가 조용히 늘거나 줄지 않는다).
   */
  applyParticipationChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      if (payload.participationRevision <= (current.state.participationRevision ?? 0)) return current
      if (!Array.isArray(payload.players) || payload.players.length === 0) return current

      const participationByUuid = new Map()
      for (const entry of payload.players) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return current
        if (typeof entry.uuid !== "string" || entry.uuid.length === 0) return current
        if (typeof entry.isParticipating !== "boolean") return current
        if (participationByUuid.has(entry.uuid)) return current
        participationByUuid.set(entry.uuid, entry.isParticipating)
      }
      const canonicalUuids = new Set((current.state.players ?? []).map((p) => p.uuid))
      if (participationByUuid.size !== canonicalUuids.size) return current
      for (const uuid of participationByUuid.keys()) {
        if (!canonicalUuids.has(uuid)) return current
      }

      // hostUuid는 승계됐을 수 있다. 모양이 맞을 때만 갱신하고, 그 외에는 지금 값을 지킨다 —
      // 알 수 없는 값으로 덮으면 "방장을 모른다"와 "방장이 아니다"가 섞인다.
      const nextHostUuid = typeof payload.hostUuid === "string" && payload.hostUuid.length > 0
        ? payload.hostUuid
        : current.hostUuid

      return {
        hostUuid: nextHostUuid,
        state: {
          ...current.state,
          hostUuid: nextHostUuid,
          participationRevision: payload.participationRevision,
          players: (current.state.players ?? []).map((p) => ({
            ...p,
            isParticipating: participationByUuid.get(p.uuid),
          })),
          // F-21(AC-03): 이탈은 준비·투표의 **분모**를 바꾼다. 화면이 스스로 세면 "이탈자를
          // 언제 빼는가"가 서버와 어긋나 준비 3/4가 영원히 채워지지 않는다. 모양이 맞을
          // 때만 갱신하고, 없으면 지금 값을 지킨다(모르는 값으로 덮지 않는다).
          ...(isPublicProgressShape(payload.progress)
            ? { progress: { ...payload.progress } }
            : {}),
        },
      }
    }),

  /**
   * F-21(AC-03): **본인** 제출 상태 개인 전송(session_self_progress)을 반영한다.
   *
   * 공개 방송과 나눈 이유는 내용이 비밀이기 때문이다 — 표적이 이탈로 기권으로 정규화됐다는
   * 사실을 채널에 실으면 누가 누구를 찍었는지가 드러난다. 같은 participationRevision을 달고
   * 오므로 세대 판정은 공개 사건과 동일하다(더 낮은 세대는 완전한 no-op).
   *
   * 여기서 실린 값이 canonical이다 — 화면의 로컬 제출 controller는 이 값을 받으면 자기
   * 낙관적 상태를 버린다(늦은 ACK가 되살리지 못하도록 revision을 함께 본다).
   */
  applySelfProgress: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.participationRevision) || payload.participationRevision < 0) return current
      // 공개 사건이 먼저 도착해 같은 세대를 이미 반영했을 수 있다 — 개인 값은 그 세대에서도
      // 처음 받는 것이므로 `<`만 막는다(공개 경로의 `<=`와 다른 이유).
      if (payload.participationRevision < (current.state.participationRevision ?? 0)) return current
      if (payload.self === null || typeof payload.self !== "object" || Array.isArray(payload.self)) return current

      /**
       * F-21(AC-03/AC-05): **개인 값의 순서는 개인 값의 시계로 정한다.**
       *
       * participationRevision은 참여가 바뀔 때만 오른다 — 이탈 이후의 평범한 제출은 세대를
       * 올리지 않으므로, 세대만 보면 "이탈 당시의 미제출(false)"과 "그 뒤의 제출(true)"이 같은
       * 세대의 사건이 되어 도착 순서가 뒤집혀도 알 수 없다. 그래서 서버는 개인 전송마다 1씩
       * 오르는 selfProgressSeq를 함께 싣고, 이 store는 **적용한 값을 기억**한다.
       *
       * 그 기억이 없으면(이전 구현) 더 낮은 세대의 옛 개인 사건·옛 스냅샷이 정규화된 제출
       * 상태를 되돌릴 수 있었다. 같은 세대의 공개 사건은 이 값과 무관하게 그대로 적용된다
       * (공개 경로는 자기 세대 검사를 따로 갖는다).
       *
       * 순서값을 싣지 않은 구버전 payload는 막지 않는다 — 다만 이미 순서를 아는 화면은
       * 그보다 옛것으로 보고 되돌리지 않는다(fail-closed).
       */
      const appliedSeq = current.state.selfProgressSeq ?? 0
      const incomingSeq = payload.selfProgressSeq
      if (Number.isInteger(incomingSeq)) {
        if (incomingSeq <= appliedSeq) return current
      } else if (appliedSeq > 0) {
        return current
      }

      const nextSelf = { ...current.state.self }
      for (const key of SELF_SUBMISSION_KEYS) {
        if (Object.hasOwn(payload.self, key)) nextSelf[key] = payload.self[key]
      }

      return {
        state: {
          ...current.state,
          self: nextSelf,
          ...(Number.isInteger(incomingSeq) ? { selfProgressSeq: incomingSeq } : {}),
          // 개인 전송에도 같은 공개 진행 수가 실린다(수신자가 둘을 따로 기다리지 않게).
          ...(isPublicProgressShape(payload.progress) ? { progress: { ...payload.progress } } : {}),
        },
      }
    }),

  // night_result_applied 방송을 반영한다. 호출부(useGameSessionSocketEvents)가 이미
  // parseNightResultAppliedPayload로 검증한 값만 넘기지만, applyPhaseChanged와 동일한 이유로
  // 여기서도 독립적으로 gameId/dayIndex 단조성을 재확인한다 — phase/dayIndex/players[].alive를
  // 하나의 set()으로 함께 반영해 중간 렌더에서 상태가 어긋나지 않게 한다.
  applyNightResultAppliedPayload: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      // 이미 ENDED면 어떤 재요청·stale broadcast도 종료 상태를 되돌리지 않는다(멱등·불변).
      if (current.state.phase === "ENDED") return current

      // 승리 조건이 밤 사망 직후 확정되면 DAY 전이 없이 ENDED payload가 도착한다(dayIndex는
      // 증가하지 않고 그대로 유지될 수 있다) — parseNightResultAppliedPayload와 동일한 이유로
      // 아래 "phase !== 'DAY'" 분기보다 먼저 처리한다.
      if (payload.phase === "ENDED") {
        if (!Number.isInteger(payload.dayIndex)) return current
        if (!Array.isArray(payload.players)) return current
        if (payload.dayIndex < current.state.dayIndex) return current

        const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.isAlive]))
        const nextPlayers = current.state.players.map((p) =>
          aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
        )

        return {
          state: {
            ...current.state,
            phase: "ENDED",
            dayIndex: payload.dayIndex,
            dayPhase: null, // 낮을 벗어났다 — dayPhase는 phase === "DAY"일 때만 의미가 있다.
            // 밤을 벗어났다 — 역할 턴은 phase === "NIGHT"일 때만 의미가 있다. 여기서 비우지
            // 않으면 지난 밤의 마지막 턴이 다음 밤으로 이월돼, 그 밤의 첫 turn 방송이 도착하기
            // 전에 엉뚱한 역할의 안내가 한 장 뜬다.
            ...CLEARED_NIGHT_TURN,
            players: nextPlayers,
            ...(payload.winResult ? { winResult: payload.winResult } : {}),
          },
        }
      }

      if (payload.phase !== "DAY") return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!Array.isArray(payload.players)) return current
      if (payload.dayIndex <= current.state.dayIndex) return current

      const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.alive]))
      const nextPlayers = current.state.players.map((p) =>
        aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
      )

      // 새 낮은 항상 토론부터 시작한다(서버 enterDayPhase와 대응) — 지난 낮이 투표 중이었더라도
      // 이월되지 않는다.
      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: "DAY_DISCUSSION",
          dayVoteRound: 1,
          dayVoteExcludedUuids: [],
          dayVoteResolution: null,
          // 밤을 벗어났다 — 위 ENDED 분기와 같은 이유로 역할 턴을 비운다.
          ...CLEARED_NIGHT_TURN,
          players: nextPlayers,
        },
      }
    }),

  // night_turn_started 방송(밤 안의 역할 턴 전이)을 반영한다. 호출부
  // (useGameSessionSocketEvents)가 이미 parseNightTurnStartedPayload로 검증한 값만 넘기지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 독립적으로 gameId/phase/dayIndex를 재확인한다.
  //
  // 여기 담기는 nightTurnRole이 곧 selectInGameNightTurnRole이 읽는 canonical 턴이다.
  // 이 값이 없는 구간에는 로컬 시작 역할을 추정하지 않고 다음 서버 방송을 기다린다.
  //
  // 생존 여부는 어디에서도 보지 않는다. 백엔드는 생존자가 없는 역할의 턴도 똑같이 돌리고
  // 똑같은 payload를 방송하므로(부채널 차단), 그 성질을 그대로 통과시켜야 죽은 역할의 턴에도
  // 모든 참가자 화면에 안내가 동일하게 뜬다.
  applyNightTurnStarted: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      // 역할 턴은 밤에만 의미가 있다. 서버는 NIGHT 전이 방송(day_vote_resolved 등)을 보낸
      // "뒤에" 턴 시퀀스를 시작하므로, 정상 경로에서 이 게이트에 걸리는 일은 없다 — 늦게
      // 도착한 이전 밤의 턴이 낮·재판 화면에 새어드는 것을 막는 방어다.
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role.length === 0) return current
      if (!Number.isFinite(parsed.deadline) || parsed.deadline <= 0) return current
      // 같은 턴의 중복 방송은 참조 보존 no-op — 안내는 canonical 턴이 실제로 바뀔 때만 열려야
      // 하므로, 같은 값의 재방송이 리렌더나 안내 재생을 만들지 않게 한다.
      if (current.state.nightTurnRole === parsed.role && current.state.nightTurnDeadline === parsed.deadline) {
        return current
      }

      return { state: { ...current.state, nightTurnRole: parsed.role, nightTurnDeadline: parsed.deadline } }
    }),

  // night_turn_ended는 서버가 현재 역할 턴을 끝냈다는 canonical 방송이다. 현재 턴과 정확히
  // 일치할 때만 role/deadline을 함께 비우고, 늦은 종료 방송은 참조 보존 no-op으로 버린다.
  applyNightTurnEnded: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state || parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role !== current.state.nightTurnRole) return current

      return { state: { ...current.state, ...CLEARED_NIGHT_TURN } }
    }),

  // day_phase_changed 방송(낮 안의 DAY_DISCUSSION→DAY_VOTE 전이)을 반영한다. 호출부
  // (useGameSessionSocketEvents)가 이미 parseDayPhaseChangedPayload로 검증한 값만 넘기지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 독립적으로 gameId/phase/dayIndex를 재확인한다.
  // dayPhase는 phase === "DAY"일 때만 의미가 있으므로 낮이 아니면 어떤 경우에도 반영하지 않는다.
  applyDayPhaseChanged: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (parsed.dayPhase !== "DAY_VOTE") return current
      // 이미 투표가 열려 있으면 참조 보존 no-op — 재투표 라운드가 DAY_VOTE에 머무는 동안
      // 늦게 도착한 중복 방송이 불필요한 리렌더를 만들지 않게 한다.
      if (current.state.dayPhase === "DAY_VOTE") return current

      return { state: { ...current.state, dayPhase: "DAY_VOTE" } }
    }),

  // day_vote_resolved 방송을 반영한다. TRIBUNAL 판정은 phase를 TRIBUNAL로 바꾸고
  // tribunal.defendantUuid를 채우며, TIE/ABSTAINED는 TRIBUNAL 없이 곧장 phase를 NIGHT로
  // 바꾼다(dayIndex는 그대로 — commitDayVoteResolution의 TIE/ABSTAINED→NIGHT 전이와 대응).
  // 호출부가 이미 파싱한 값만 넘기지만, applyNightResultAppliedPayload와 동일한 이유로 여기서도
  // 독립적으로 gameId/phase/dayIndex/round 일관성을 재확인한다. REVOTE는 DAY에 남는다.
  applyDayVoteResolvedToPhase: (gameId, dayIndex, resolution = {}) =>
    set((current) => {
      const { outcome, defendantUuid, round = 1 } = resolution
      if (typeof gameId !== "string" || gameId.trim().length === 0) return current
      if (!Number.isInteger(dayIndex)) return current
      if (!current.gameId || !current.state) return current
      if (gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (dayIndex !== current.state.dayIndex) return current
      if (round !== getDayVoteRound(current.state)) return current
      const rosterIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const roundFields = parseDayVoteRoundFields(resolution, rosterIds)
      if (!roundFields) return current
      const dayVoteResolution = {
        outcome,
        tribunalTargetUuid: outcome === "TRIBUNAL" ? defendantUuid : null,
        ...roundFields,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
      }

      if (outcome === "REVOTE") {
        if (current.state.dayPhase !== "DAY_VOTE") return current
        return { state: {
          ...current.state,
          dayVoteRound: round + 1,
          dayVoteExcludedUuids: [...roundFields.revoteExcludedUuids],
          dayVoteResolution,
          tribunal: null,
          self: { ...current.state.self, hasActedThisPhase: false },
        } }
      }

      // 두 분기 모두 낮을 벗어나므로 dayPhase를 null로 되돌린다 — dayPhase는 phase === "DAY"일
      // 때만 의미가 있고, 다음 낮 진입 경로가 다시 DAY_DISCUSSION으로 세팅한다.
      if (outcome === "TRIBUNAL") {
        if (typeof defendantUuid !== "string" || defendantUuid.length === 0) return current
        return { state: { ...current.state, phase: "TRIBUNAL", dayPhase: null, dayVoteResolution, tribunal: { defendantUuid } } }
      }
      if (outcome === "TIE" || outcome === "ABSTAINED") {
        // 새 밤은 항상 "아직 어떤 턴도 방송되지 않은" 상태에서 시작한다. 첫
        // night_turn_started가 도착하기 전까지 role/deadline은 비어 있어야 한다.
        return {
          state: { ...current.state, phase: "NIGHT", dayPhase: null, dayVoteResolution, ...CLEARED_NIGHT_TURN },
          // NIGHT 재진입 — 지난 밤의 개인 결과는 이 밤으로 넘어오지 않는다.
          ...CLEARED_NIGHT_PRIVATE_RESULT,
        }
      }
      return current
    }),

  // tribunal_vote_resolved 방송을 반영한다. 검증·staleness 판단은 순수 함수
  // applyTribunalResolvedPure에 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 그 결과를
  // set()에 그대로 전달하기만 한다.
  // 무죄·비종결 판정은 TRIBUNAL에서 곧장 NIGHT로 넘어간다 — 그 경로만 개인 결과를 함께
  // 비운다(참조 보존 no-op이나 ENDED 전이에서는 건드리지 않는다).
  applyTribunalResolved: (payload) =>
    set((current) => {
      const patch = applyTribunalResolvedPure(current, payload)
      if (patch === current) return current
      if (patch.state?.phase !== "NIGHT") return patch
      return { ...patch, ...clearNightPrivateResultOnNightEntry(current) }
    }),

  // get_session_snapshot 재접속 응답을 반영한다. 검증·병합은 순수 함수 applySessionSnapshotPure에
  // 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 실제로 반영된 경우에만 snapshotSeq를
  // 하나 올려 "이 변화는 실시간 전이가 아니라 하이드레이션"임을 구독자에게 알린다.
  //
  // nightPrivateResult는 여기서 절대 건드리지 않는다 — applySessionSnapshotPure가 만드는 patch는
  // state(+snapshotSeq)뿐이고, 하이드레이션은 "새 밤에 들어갔다"가 아니라 "지금까지의 상태를
  // 다시 받았다"이므로 아직 확인하지 않은 개인 결과를 지울 근거가 되지 않는다.
  //
  // F-23(AC-05/SPLIT-1): 두 번째 인자 receiptContext는 요청을 **보낸 그 순간**의 범위다
  // (readInGameReceiptScope가 만든다 — 응답 payload에서 읽지 않는다). 적용 직전에 이 store가
  // 소유한 축을 다시 맞춰 보고, 기존 pure 검증이 실제 patch를 돌려준 경우에만 state·
  // snapshotSeq·snapshotResultOwner를 **같은 set에서** 함께 저장한다. 형태 오류·ok:false·
  // 범위 불일치는 셋 모두 참조 보존 no-op이다.
  applySessionSnapshot: (response, receiptContext = null) =>
    set((current) => {
      if (receiptContext !== null && !isReceiptScopeCurrent(receiptContext, current)) return current
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      // F-23(AC-05): 기존 non-null 소속과 **다른 소속**을 주장하는 응답은 여기서 끝난다 —
      // state·snapshotSeq·수신 증거 셋 모두 참조 보존 no-op이고, 관측 기준도 채택하지 않는다.
      if (claimsForeignMembership(current, patch.state)) return current
      const snapshotSeq = current.snapshotSeq + 1
      // 이 커밋이 만든 소속을 같은 자리에서 관측 기준으로 채택한다 — 자기 복원을 외부 소속
      // 교체로 오인하지 않게 한다(아래 store 구독자는 같은 값을 다시 보므로 세지 않는다).
      adoptIdentityScope(current.gameId ?? null, patch.state)
      return {
        ...patch,
        snapshotSeq,
        snapshotResultOwner: buildSnapshotResultOwner(receiptContext, current.gameId ?? null, patch.state, snapshotSeq),
      }
    }),

  // 브라우저 새로고침으로 메모리 store가 비었어도 인증된 서버의 현재 세션 스냅샷을 한 번에
  // 복원한다. 이미 게임 상태가 있으면 기존 신뢰 경계를 우회하지 않도록 반드시 no-op 한다.
  //
  // F-23(SPLIT-1): 빈 store에서 시작하므로 요청 시점의 gameId·membershipId는 둘 다 null이어야
  // 한다. 그렇지 않은 요청(그 사이 이미 다른 판·다른 소속이 붙은 화면)이 응답을 현재 권위로
  // 승격하지 못하게 막고, 응답이 주장하는 본인이 요청 계정과 다르면 아예 반영하지 않는다.
  // 이 커밋이 만드는 gameId/소속은 **후속 범위**로 원자적으로 채택한다.
  bootstrapSessionSnapshot: (response, receiptContext = null) =>
    set((current) => {
      if (current.gameId || current.state) return current
      if (receiptContext !== null) {
        // 빈 store이므로 현재 소속은 반드시 null이다 — 소속을 들고 있던 요청은 이 검사에서
        // 그대로 걸린다(그 화면은 이미 다른 판에 앉아 있었다는 뜻이다).
        if (!isReceiptScopeCurrent(receiptContext, current)) return current
        if (receiptContext.accountId !== null && response?.self?.uuid !== receiptContext.accountId) return current
      }
      const patch = bootstrapSessionSnapshotPure(response)
      if (!patch) return current
      const snapshotSeq = current.snapshotSeq + 1
      adoptIdentityScope(patch.gameId ?? null, patch.state)
      // 빈 store에 gameId가 처음 붙는 경로다(gameId 변경) — 개인 결과도 이 세션 기준으로
      // 새로 시작한다. 어차피 비어 있지만, gameId가 바뀌는 모든 경로가 같은 규칙을 따르게 한다.
      return {
        ...patch,
        error: null,
        snapshotSeq,
        snapshotResultOwner: buildSnapshotResultOwner(receiptContext, patch.gameId ?? null, patch.state, snapshotSeq),
        ...CLEARED_NIGHT_PRIVATE_RESULT,
      }
    }),

  /**
   * F-23(SPLIT-1): **확인하지 못한 종료 결과의 이동 근거만 걷어낸다.**
   *
   * 신원(계정·소속)이나 연결이 바뀐 뒤 현재 신원의 스냅샷을 끝내 받지 못하면(타임아웃·전송
   * 오류·거부·ok:false), 지금 화면이 들고 있는 종료 상태는 **이전 신원·이전 연결이 받아 둔
   * 사실**이다. 그 값을 그대로 둔 채 재결속 보류만 풀면 화면은 옛 사실로 결과 화면에
   * 들어간다 — 그 보류가 막으려던 바로 그 결함이 실패 경로로 되살아난다.
   *
   * 그래서 이동 근거인 winResult만 비운다. phase는 건드리지 않는다 — ENDED는 서버가 한 번
   * 확정하면 되돌릴 수 없는 잠금이고(applySessionSnapshotPure의 종료 잠금), 우리가 확인하지
   * 못한 것은 "지금 결과 화면으로 가도 되는가" 하나뿐이다. winResult 없는 ENDED는 이 store가
   * 이미 만드는 모양이다(applyNightResultAppliedPayload의 ENDED 분기는 payload에 승패가 실려
   * 있을 때만 채운다).
   *
   * **영구 무효가 아니다.** 현재 연결의 정상 스냅샷이 ENDED를 다시 실으면 winResult도 함께
   * 복원되어(applySessionSnapshotPure는 ENDED 응답에 winResult를 강제한다) 결과 이동이 그대로
   * 재개된다 — 사용자가 인게임 화면에 갇히지 않는다.
   *
   * 걷어낼 근거가 없으면 참조 보존 no-op이다(불필요한 리렌더를 만들지 않는다).
   */
  invalidateUnconfirmedTerminalResult: () =>
    set((current) => {
      if (!current.gameId || !current.state) return current
      if (current.state.phase !== "ENDED") return current
      if (!current.state.winResult) return current
      return { state: { ...current.state, winResult: null } }
    }),

  // night_action_result를 반영한다. 형태·게임/밤 일치·본인 여부 검증은 호출부
  // (useGameSessionSocketEvents → parseInGameNightPrivateResultPayload)가 이미 끝냈지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 gameId 일치만은 독립적으로 재확인한다.
  setNightPrivateResult: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (!current.gameId || parsed.gameId !== current.gameId) return current
      return { nightPrivateResult: parsed }
    }),

  // 오버레이 확인 — 개인 결과를 비우는 세 경로 중 하나다. 이미 비어 있으면 참조 보존 no-op이라
  // 확인 버튼의 중복 클릭이 불필요한 리렌더를 만들지 않는다.
  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : CLEARED_NIGHT_PRIVATE_RESULT)),

  setGameError: (error) => set({ error }),

  clearGame: () =>
    set({
      gameId: null, state: null, hostUuid: null, error: null,
      // 세션 정리는 수신 증거의 끝이기도 하다 — 남겨 두면 뒤이어 도착한 옛 응답이 되살아난
      // 화면에서 다시 연출이 된다. 단조 세대는 여기서도 되돌리지 않는다(아래 구독자 참고).
      snapshotResultOwner: null,
      ...CLEARED_NIGHT_PRIVATE_RESULT,
    }),
}))

// 최초 관측 기준. 이후로는 **실제 전이만** 세대를 올린다(초기값 자체는 전이가 아니다).
adoptIdentityScope(null, null)

/**
 * 계정/소속 축의 유일한 관측 지점. 액션이든 setState든 어떤 경로로 바뀌어도 여기를 지난다.
 * zustand는 set마다 구독자를 **동기적으로** 부르므로, 같은 React 배치 안의 A→B→A도 두 전이로
 * 남는다(값 비교만으로는 구별할 수 없는 바로 그 구간이다).
 */
useInGameStore.subscribe((next) => {
  adoptIdentityScope(next.gameId ?? null, next.state ?? null)
})

export const selectInGameState = (store) => store.state
