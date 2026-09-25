// game-core/gameSession.js의 ROLE_TEAMS와 값이 일치해야 한다 — 이 프로젝트에는 백엔드/프런트가
// 공유하는 상수 모듈이 없어 수동으로 동기화한다(buildPlayerSessionSourceFromGameState.js와 동일한
// 관례로 이 파일에도 독립적으로 복제한다).
import { parseDayVoteRoundFields } from "../utils/dayVoteRound.js"
// F-23(AC-05): 공개 밤 사망 연출은 라이브 방송(night_result_applied)과 재접속 스냅샷이 **같은**
// 공개 데이터를 싣는다(game-core buildNightResultAppliedPayload / buildSessionSnapshot). 두
// 경로가 서로 다른 정규화를 쓰면 같은 사망이 다른 모양으로 들어와 연출이 갈라지므로, 라이브
// 경로가 이미 쓰는 정규화기를 그대로 재사용한다.
import { normalizeInGameNightDeathReveals } from "../utils/normalizeInGameNightDeathReveals.js"
// F-24(RESTORE-24): 복원 원본 설정의 허용 목록은 한 곳(setup/utils)이 소유한다. 그 모듈은
// 순수 함수만 담고 있어(zustand·React 없음) 스냅샷 경로가 저장소 모듈을 끌어오지 않는다.
import { sanitizeRoomSettings } from "../../setup/utils/roomSettingsSourceSanitize.js"

const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

const KNOWN_PHASES = new Set(["ROLE_REVEAL", "NIGHT", "DAY", "TRIBUNAL", "ENDED"])
/**
 * F-26(AC-04): **같은 날짜 안의** 진행 순서. 서버 canonical 전이 순서와 같다 —
 * ROLE_REVEAL → (다음 날짜의) DAY → TRIBUNAL → NIGHT, 종료는 언제나 마지막이다.
 * 날짜를 넘는 비교에는 쓰지 않는다(NIGHT n → DAY n+1은 날짜가 이미 갈라 준다).
 */
const PHASE_PROGRESS_RANK = Object.freeze({
  ROLE_REVEAL: 0, DAY: 1, TRIBUNAL: 2, NIGHT: 3, ENDED: 4,
})
// 이 두 phase에서는 밤 사이 아직 낮/재판 관련 결과가 존재할 수 없다(game-core의
// canIncludeDayTribunalFields와 동일한 게이트) — nightResult/dayVoteResolution/tribunal
// 모두 이 phase에서는 반드시 없어야 한다.
const PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS = new Set(["ROLE_REVEAL", "NIGHT"])
// 낮 하위 구간(game-core의 DAY_PHASES와 값이 일치해야 한다). dayPhase는 phase === "DAY"일
// 때만 의미가 있으므로 스냅샷도 낮에서만 이 키를 싣는다 — winResult↔ENDED와 같은 양방향
// 불변조건으로 검증한다.
const KNOWN_DAY_PHASES = new Set(["DAY_DISCUSSION", "DAY_VOTE"])
const DAY_VOTE_OUTCOMES = new Set(["ABSTAINED", "TIE", "TRIBUNAL", "REVOTE"])
const TRIBUNAL_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

/**
 * F-21(AC-03): 서버가 실어 준 **본인** 제출 필드만 그대로 옮긴다.
 *
 * 없는 값을 만들어내지 않는다 — 키가 없으면 "모른다"이고, 화면은 기존 로컬 controller 상태를
 * 그대로 쓴다. 있으면 그것이 canonical이다(이탈로 기권 정규화된 표는 dayVoteTargetUuid=null).
 */
const SELF_SUBMISSION_KEYS = Object.freeze([
  "hasAcknowledgedRoleReveal",
  "isDayVoteReady",
  "hasSubmittedDayVote",
  "dayVoteTargetUuid",
  "dayVoteRound",
  "hasSubmittedTribunalVote",
])

function copySelfSubmissionFields(self) {
  const fields = {}
  for (const key of SELF_SUBMISSION_KEYS) {
    if (Object.hasOwn(self, key)) fields[key] = self[key]
  }
  return fields
}

/**
 * F-24(AC-04/RESTORE-24): 서버가 실어 준 복원 원본을 **새 구조로** 옮긴다.
 *
 * 응답 객체를 그대로 들고 있으면 두 가지가 깨진다 — 호출부가 응답을 변형하면 store가 함께
 * 오염되고, 서버가 허용 목록 밖 키를 실어 보낸 경우(구버전·오염 데이터) 그 키가 그대로
 * 복원 경로로 흘러든다.
 *
 * 예전에는 settings의 모든 키를 얕게 복사해 참조만 끊었다. 그것으로는 두 번째 문제가 남는다 —
 * 폐기된 키가 이 경계를 그대로 통과해 **인게임 store까지** 들어오고,
 * 영속 경계가 걷어내기 전까지 화면이 그 값을 들고 있게 된다. 정제는 영속 경계 하나가 아니라
 * **이 경계에서도** 일어나야 한다(RESTORE-24: 전 경로 배제). 그래서 설정 허용 목록의 단일
 * 소유자(setup/utils/roomSettingsSourceSanitize.js)를 그대로 쓴다 — 두 경계가 같은 목록을
 * 보므로 한쪽만 고쳐져 갈라질 수 없다.
 *
 * 모양이 아니면 null이다(fail-closed) — 그때 인게임 훅은 "복원 불가"로 표시한다.
 */
export function normalizeRoomSettingsSourceForStore(raw) {
  return normalizeRoomSettingsSource(raw)
}

function normalizeRoomSettingsSource(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (raw.settings === null || typeof raw.settings !== "object" || Array.isArray(raw.settings)) return null
  if (raw.accessType !== "open" && raw.accessType !== "code") return null
  // sanitizeRoomSettings는 허용 목록 밖의 키, 허용 키에 숨은 객체 값, 중첩 역할 맵의 폐기된
  // 항목을 전부 버리고 **새 구조**를 만든다(참조 끊기와 정제가 같은 한 번의 작업이다).
  const { settings } = sanitizeRoomSettings(raw.settings)
  return {
    accessType: raw.accessType,
    settingsVersion: isNonNegativeInteger(raw.settingsVersion) ? raw.settingsVersion : null,
    settings,
  }
}

/** 공개 진행 수의 모양 검사. kind는 문자열이고 두 수는 음이 아닌 정수이거나 null이다. */
function isPublicProgress(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (!isNonEmptyString(value.kind)) return false
  const okCount = (n) => n === null || isNonNegativeInteger(n)
  return okCount(value.doneCount) && okCount(value.requiredCount)
}

/**
 * 새로고침으로 메모리 store가 완전히 비었을 때 서버 스냅샷 자체를 신뢰 경계의 씨앗으로
 * 삼아 기존의 엄격한 applySessionSnapshotPure 검증을 재사용한다. 인증된 socket의 서버가
 * 돌려준 self/roster만으로 최소 current를 만든 뒤, 최종 store 형태는 한 경로에서 조립한다.
 */
export function bootstrapSessionSnapshotPure(response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return null
  if (!isNonEmptyString(response.gameId)) return null
  if (!Array.isArray(response.players) || response.players.length === 0) return null
  if (response.self === null || typeof response.self !== "object" || Array.isArray(response.self)) return null
  if (!isNonEmptyString(response.self.uuid)) return null

  const seed = {
    gameId: response.gameId,
    state: {
      id: response.gameId,
      players: response.players.map((player) => ({ uuid: player?.uuid })),
      self: { uuid: response.self.uuid },
    },
  }
  const patch = applySessionSnapshotPure(seed, response)
  if (patch === seed) return null
  return { gameId: response.gameId, ...patch }
}

/**
 * get_session_snapshot 재접속 응답(신뢰하지 않는 외부 입력)을 store에 통째로 반영할지 판정하는
 * 순수 함수. 전체 payload(roster/self/phase별 결과 필드)를 끝까지 검증한 뒤에만 단일 원자적
 * 교체를 수행하고, 하나라도 어긋나면 원래 current 참조를 그대로 반환한다(부분 반영 없음).
 * current.gameId/current.state.self.uuid를 신뢰 경계(기대 게임/기대 본인)로 사용해 response를
 * 검증한다 — response가 주장하는 값이 아니라 기존 세션이 실제로 기대하는 값과 일치해야 한다.
 * 생략된 phase별 결과 필드(nightResult/dayVoteResolution/tribunal/winResult)는 이전 값을
 * 이어받지 않고 명시적으로 null로 비운다 — stale 데이터가 새 phase로 새어 들어가지 않게 한다.
 * 모든 중첩 구조는 response에서 필드 단위로 새로 만들어 반환하므로, 호출부가 이후 response를
 * 변형해도 store에는 영향이 없다. 예외는 players[].themeIndex 하나다 — 스냅샷 payload에 없는
 * 표시 색상이라 기존 current 값을 uuid로 이어받는다(아래 조립부 주석 참고).
 * 낮 하위 구간(dayPhase)도 같은 원칙으로 다룬다 — phase === 'DAY'인 스냅샷에서만 실리고,
 * 그 외 phase로 복원할 때는 null로 비운다.
 * @param {object} current - 현재 store 상태(gameId/state를 신뢰 경계로 쓴다)
 * @param {object} response - get_session_snapshot 응답(신뢰하지 않는 외부 입력)
 * @flow 형태·소유권·roster·self·phase별 결과 필드·dayPhase를 차례로 검증하고, 하나라도 어긋나면
 *       즉시 current를 그대로 돌려준다(부분 반영 없음) — 전부 통과한 뒤에만 새 state를 조립한다.
 */
export function applySessionSnapshotPure(current, response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return current
  if (response.ok !== true) return current
  if (typeof response.phase !== "string" || !KNOWN_PHASES.has(response.phase)) return current
  if (!isNonNegativeInteger(response.dayIndex)) return current

  // 재접속할 기존 세션이 있어야 하고(존재하지 않는 세션으로는 스냅샷을 적용할 수 없다),
  // gameId는 response가 아니라 현재 store가 신뢰 경계로 요구하는 값이다.
  if (!current.gameId || !current.state) return current
  if (!isNonEmptyString(current.gameId) || !isNonEmptyString(response.gameId)) return current
  if (response.gameId !== current.gameId) return current

  if (!Array.isArray(response.players) || response.players.length === 0) return current
  const rosterByUuid = new Map()
  for (const player of response.players) {
    if (player === null || typeof player !== "object" || Array.isArray(player)) return current
    if (!isNonEmptyString(player.uuid)) return current
    if (!isNonEmptyString(player.nickname)) return current
    if (typeof player.isAlive !== "boolean") return current
    if (typeof player.isConnected !== "boolean") return current
    // F-21(AC-03/AC-06): 생존과 분리된 사실이다. 없는 구버전 스냅샷은 "참여 중"으로 본다
    // (그 서버에는 아직 이탈 개념이 없었으므로 roster에 있다는 사실이 곧 참여다).
    if (Object.hasOwn(player, "isParticipating") && typeof player.isParticipating !== "boolean") return current
    if (Object.hasOwn(player, "membershipId") && player.membershipId !== null && !isNonEmptyString(player.membershipId)) return current
    if (Object.hasOwn(player, "themeIndex") && !isNonNegativeInteger(player.themeIndex)) return current
    // F-13(AC-05): 계정 프로필 사진·테두리는 backend buildPlayerAccountProfileFields와 동일한
    // own-property 조건부 계약이다(비밀이 아니라 조건부 노출) — 있으면 반드시 비어있지 않은
    // 문자열이어야 하고, 없는 참가자는 그대로 키 자체가 없어야 한다.
    if (Object.hasOwn(player, "accountProfilePhotoId") && !isNonEmptyString(player.accountProfilePhotoId)) return current
    if (Object.hasOwn(player, "accountProfileBorderId") && !isNonEmptyString(player.accountProfileBorderId)) return current
    if (Object.hasOwn(player, "accountCardFrameId") && player.accountCardFrameId !== null && !isNonEmptyString(player.accountCardFrameId)) return current
    // CO S-1(AC-04): 계정 전적(총 판수·승률)도 같은 own-property 조건부 계약이다 — 서버가
    // 조회에 실패한 참가자에게는 키 자체를 만들지 않으므로(backend captureRoomStartProfiles)
    // "없음"은 정상이다. 있으면 화면이 그대로 숫자로 그리는 값이라 모양을 여기서 강제한다:
    // 판수는 음수·소수·문자열이면 안 되고, 승률은 거기에 더해 100을 넘을 수 없다. 어긋나면
    // 이 필드만 버리지 않고 응답 전체를 거부한다 — 한 필드가 망가진 응답의 나머지 값을
    // 신뢰할 근거가 없기 때문이다(이 함수의 다른 모든 검증과 같은 원자적 거부).
    if (Object.hasOwn(player, "accountTotalGames") && !isNonNegativeInteger(player.accountTotalGames)) return current
    if (Object.hasOwn(player, "accountWinRate")
      && (!isNonNegativeInteger(player.accountWinRate) || player.accountWinRate > 100)) return current
    if (rosterByUuid.has(player.uuid)) return current
    rosterByUuid.set(player.uuid, player)
  }
  // 응답 roster의 uuid 집합은 기존 세션 roster와 정확히 일치해야 한다 — 스냅샷 반영으로
  // 참가자가 조용히 사라지거나 추가되는 일은 없다(집계는 항상 같은 인원 구성 위에서만 갱신).
  const currentUuids = new Set((current.state.players ?? []).map((p) => p.uuid))
  if (rosterByUuid.size !== currentUuids.size) return current
  for (const uuid of rosterByUuid.keys()) {
    if (!currentUuids.has(uuid)) return current
  }

  const self = response.self
  if (self === null || typeof self !== "object" || Array.isArray(self)) return current
  if (!isNonEmptyString(self.uuid)) return current
  if (!isNonEmptyString(self.nickname)) return current
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return current
  if (self.team !== ROLE_TEAMS[self.role]) return current
  if (Object.hasOwn(self, "accountSkinId") && self.accountSkinId !== null && !isNonEmptyString(self.accountSkinId)) return current
  if (typeof self.hasActedThisPhase !== "boolean") return current
  if (!rosterByUuid.has(self.uuid)) return current
  // 기대 본인(current.state.self.uuid)과 response.self.uuid가 일치해야 한다 — 다른 참가자의
  // 재접속 응답을 내 것으로 오인해 반영하지 않도록 하는 신뢰 경계다.
  if (self.uuid !== current.state.self?.uuid) return current
  if (rosterByUuid.get(self.uuid).nickname !== self.nickname) return current

  // allies는 JOKER 전용 own-property 계약이다(buildPlayerSessionSourceFromGameState.js와 동일한
  // 정책). JOKER는 반드시 있어야 하고, 비-JOKER는 undefined를 포함해 키 자체가 없어야 한다.
  let allies = null
  if (self.role === "JOKER") {
    if (!Object.hasOwn(self, "allies")) return current
    if (!Array.isArray(self.allies)) return current
    const seenAllies = new Set()
    for (const allyUuid of self.allies) {
      if (typeof allyUuid !== "string" || allyUuid.length === 0) return current
      if (allyUuid === self.uuid) return current
      if (!rosterByUuid.has(allyUuid)) return current
      if (seenAllies.has(allyUuid)) return current
      seenAllies.add(allyUuid)
    }
    allies = [...self.allies]
  } else if (Object.hasOwn(self, "allies")) {
    return current
  }

  const dayTribunalFieldsAllowed = !PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS.has(response.phase)

  let nightResult = null
  if (Object.hasOwn(response, "nightResult")) {
    if (!dayTribunalFieldsAllowed) return current
    const raw = response.nightResult
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return current
    // nightResult는 스냅샷이 보고하는 그 날짜(response.dayIndex)에 대해서만 의미가 있다 —
    // 다른 날짜를 가리키면 stale/미래 데이터이므로 전체 payload를 거부한다.
    if (!isNonNegativeInteger(raw.dayIndex) || raw.dayIndex !== response.dayIndex) return current
    if (raw.victimUuid !== null && !isNonEmptyString(raw.victimUuid)) return current
    if (raw.victimUuid !== null && !rosterByUuid.has(raw.victimUuid)) return current
    nightResult = { dayIndex: raw.dayIndex, victimUuid: raw.victimUuid }
    /**
     * F-23(AC-05): **공개 사망 연출의 복구.**
     *
     * 서버는 예전부터 이 필드를 스냅샷에 실어 보냈지만 여기서 버려졌다 — 그래서 사망 연출이
     * 재생되기 전에 새로고침·재연결한 참가자는 그 밤의 공개 사망을 끝내 보지 못했다. 여기서
     * 옮겨 두면 useInGameKillReveal이 라이브 방송과 **같은 id 형식**으로 큐에 넣어, 같은 사망이
     * 두 경로로 들어와도 한 번만 재생된다.
     *
     * 키 자체가 없는 옛 스냅샷은 그대로 둔다(호환). 있다면 배열이어야 하고, 원소는 라이브
     * 경로와 똑같이 허용된 victimUuid/source만 통과시킨 뒤 **현재 roster 안**의 것만 남긴다 —
     * roster 밖 uuid는 화면이 닉네임조차 만들 수 없는 값이라 연출로 삼지 않는다.
     */
    if (Object.hasOwn(raw, "deathReveals")) {
      if (!Array.isArray(raw.deathReveals)) return current
      nightResult.deathReveals = normalizeInGameNightDeathReveals(raw.deathReveals)
        .filter((reveal) => rosterByUuid.has(reveal.victimUuid))
    }
  }

  let dayVoteResolution = null
  if (Object.hasOwn(response, "dayVoteResolution")) {
    if (!dayTribunalFieldsAllowed) return current
    const raw = response.dayVoteResolution
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return current
    if (!DAY_VOTE_OUTCOMES.has(raw.outcome)) return current
    const roundFields = parseDayVoteRoundFields(raw, new Set(rosterByUuid.keys()))
    if (!roundFields) return current
    if (raw.outcome === "REVOTE" && (response.phase !== "DAY" || response.dayPhase !== "DAY_VOTE")) return current
    if (raw.outcome === "TRIBUNAL") {
      if (!isNonEmptyString(raw.tribunalTargetUuid)) return current
      if (!rosterByUuid.has(raw.tribunalTargetUuid)) return current
    } else if (raw.tribunalTargetUuid !== null) {
      return current
    }
    if (!isNonNegativeInteger(raw.publicVoteCount) || !isNonNegativeInteger(raw.publicAbstainCount)) return current
    if (raw.outcome === "REVOTE" && raw.publicVoteCount <= raw.publicAbstainCount) return current
    dayVoteResolution = {
      outcome: raw.outcome,
      tribunalTargetUuid: raw.outcome === "TRIBUNAL" ? raw.tribunalTargetUuid : null,
      publicVoteCount: raw.publicVoteCount,
      publicAbstainCount: raw.publicAbstainCount,
      ...roundFields,
    }
  }

  let tribunal = null
  if (Object.hasOwn(response, "tribunal")) {
    if (!dayTribunalFieldsAllowed) return current
    const raw = response.tribunal
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return current
    if (!isNonEmptyString(raw.defendantUuid)) return current
    if (!rosterByUuid.has(raw.defendantUuid)) return current
    if (typeof raw.resolved !== "boolean") return current

    if (raw.resolved) {
      if (!TRIBUNAL_OUTCOMES.has(raw.outcome)) return current
      const counts = raw.counts
      if (counts === null || typeof counts !== "object" || Array.isArray(counts)) return current
      if (!isNonNegativeInteger(counts.guilty) || !isNonNegativeInteger(counts.notGuilty)) return current
      if (raw.outcome === "GUILTY" && raw.executedUuid !== raw.defendantUuid) return current
      if (raw.outcome === "NOT_GUILTY" && raw.executedUuid !== null) return current
      tribunal = {
        defendantUuid: raw.defendantUuid,
        resolved: true,
        outcome: raw.outcome,
        counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
        executedUuid: raw.executedUuid,
      }
    } else {
      tribunal = { defendantUuid: raw.defendantUuid, resolved: false }
    }
  }

  // 재판(tribunal)은 TRIBUNAL 판정을 내린 낮 투표 없이는 존재할 수 없다 — 둘 다 있으면
  // 서로 같은 사건을 가리켜야 한다.
  if (dayVoteResolution !== null && tribunal !== null) {
    if (dayVoteResolution.outcome !== "TRIBUNAL") return current
    if (dayVoteResolution.tribunalTargetUuid !== tribunal.defendantUuid) return current
  }

  // winResult 존재 여부와 phase==='ENDED'는 항상 함께 성립하는 양방향 불변조건이다
  // (finalizeGameSession이 유일하게 phase를 ENDED로 바꾸며 그 호출에서 winResult도 함께 세팅됨).
  let winResult = null
  if (response.phase === "ENDED") {
    if (
      !Object.hasOwn(response, "winResult") ||
      response.winResult === null ||
      typeof response.winResult !== "object" ||
      Array.isArray(response.winResult) ||
      (response.winResult.winner !== "CITIZEN" && response.winResult.winner !== "JOKER")
    ) {
      return current
    }
    winResult = { winner: response.winResult.winner }
  } else if (Object.hasOwn(response, "winResult")) {
    return current
  }

  // dayPhase 존재 여부와 phase==='DAY'는 winResult↔ENDED와 같은 양방향 불변조건이다 — 낮
  // 스냅샷에는 반드시 알려진 하위 구간이 실려야 하고(없으면 재접속 클라이언트가 토론/투표를
  // 구분하지 못해 그 낮에 갇힌다), 낮이 아닌 스냅샷에는 키 자체가 없어야 한다.
  let dayPhase = null
  if (response.phase === "DAY") {
    if (!Object.hasOwn(response, "dayPhase") || !KNOWN_DAY_PHASES.has(response.dayPhase)) return current
    dayPhase = response.dayPhase
  } else if (Object.hasOwn(response, "dayPhase")) {
    return current
  }

  // 종료(ENDED) 확정 이후에는 어떤 스냅샷도 활성 phase로 되돌릴 수 없다(잠금). 동일하게
  // ENDED인 스냅샷을 다시 적용하는 것은 막지 않는다(멱등 재적용 허용).
  if (current.state.phase === "ENDED" && response.phase !== "ENDED") return current

  /**
   * F-26(AC-04): **시간을 거스르는 스냅샷은 적용하지 않는다.**
   *
   * 여기까지의 검사는 "같은 판·같은 인원·앞서지 않은 참여 세대·앞서지 않은 개인 순서"만 본다.
   * 그런데 조회를 보낸 뒤 실제 진행이 다음 밤으로 넘어가면, 보류돼 있던 **이전 밤의 응답**이
   * 그 값들을 모두 만족한 채 늦게 도착할 수 있다(참여 세대는 이탈에서만 오르고 selfProgressSeq도
   * 그 밤의 값 그대로다). 그 응답을 반영하면 화면은 지나간 밤으로 되돌아가고, 같은 커밋이
   * 그 밤의 성공 사건 큐까지 함께 되살린다.
   *
   * 날짜는 단조 증가한다(enterDayPhase만 올린다). 같은 날짜 안의 진행 순서도 고정이다 —
   * ROLE_REVEAL → DAY → TRIBUNAL → NIGHT, 그리고 종료(ENDED)는 그 뒤다. 그래서 더 과거를
   * 말하는 응답만 거부하고, 같은 단계의 재적용(멱등 복원)과 앞으로 가는 전이는 그대로 허용한다.
   * 현재 날짜를 모르는 화면(구버전 state)은 이 축으로 판단하지 않는다.
   */
  const currentDayIndex = current.state.dayIndex
  if (isNonNegativeInteger(currentDayIndex)) {
    if (response.dayIndex < currentDayIndex) return current
    if (response.dayIndex === currentDayIndex) {
      const currentRank = PHASE_PROGRESS_RANK[current.state.phase]
      const responseRank = PHASE_PROGRESS_RANK[response.phase]
      if (currentRank !== undefined && responseRank !== undefined && responseRank < currentRank) return current
    }
  }

  // 스냅샷 payload에는 표시 색상(themeIndex)이 없다 — game_started 한 곳에서만 내려오는
  // 값이라 여기서 roster를 새로 조립할 때 기존 store 값을 uuid로 이어받지 않으면 재접속
  // 하이드레이션마다 색이 사라진다. roster uuid 집합 일치는 위에서 이미 강제했으므로 정상
  // 경로에서는 항상 찾을 수 있고, 유효한 정수가 없으면 키 자체를 만들지 않는다
  // (buildPlayerSessionSourceFromGameState가 fail-closed로 preview fallback을 준다).
  const themeIndexByUuid = new Map(
    (current.state.players ?? [])
      .filter((p) => Number.isInteger(p?.themeIndex))
      .map((p) => [p.uuid, p.themeIndex]),
  )

  const nextPlayers = response.players.map((p) => ({
    uuid: p.uuid,
    nickname: p.nickname,
    alive: p.isAlive,
    isConnected: p.isConnected,
    // F-21(AC-01/AC-03): 새로고침 뒤에도 "사망했지만 아직 참여 중"과 "빠졌다"를 구분할 수
    // 있어야 추방 목록과 보드 사망 표시가 갈라지지 않는다.
    isParticipating: p.isParticipating !== false,
    ...(Object.hasOwn(p, "membershipId") ? { membershipId: p.membershipId } : {}),
    ...(isNonNegativeInteger(p.themeIndex)
      ? { themeIndex: p.themeIndex }
      : themeIndexByUuid.has(p.uuid)
        ? { themeIndex: themeIndexByUuid.get(p.uuid) }
        : {}),
    // F-13(AC-05): 이전 버전은 이 조립에서 계정 프로필 필드를 빠뜨려, 재접속·새로고침
    // 스냅샷을 반영할 때마다 서버가 실제로 보낸 사진·테두리 값이 store에서 조용히
    // 사라지고 최종 카드가 preview 기본 이미지로 되돌아갔다(buildPlayerSessionSourceFromGameState/
    // mergeSourcePlayerWithPreview의 own-property 조건부 계약과 동일하게 여기서도 있을 때만 옮긴다).
    ...(Object.hasOwn(p, "accountProfilePhotoId") ? { accountProfilePhotoId: p.accountProfilePhotoId } : {}),
    ...(Object.hasOwn(p, "accountProfileBorderId") ? { accountProfileBorderId: p.accountProfileBorderId } : {}),
    ...(Object.hasOwn(p, "accountCardFrameId") ? { accountCardFrameId: p.accountCardFrameId } : {}),
    // CO S-1(AC-04): 위에서 모양까지 확인한 계정 전적을 같은 조건부 복사 관례로 옮긴다 —
    // 여기서 빠뜨리면 재접속·새로고침마다 전적 목록이 전원 "조회 실패"로 되돌아간다.
    ...(Object.hasOwn(p, "accountTotalGames") ? { accountTotalGames: p.accountTotalGames } : {}),
    ...(Object.hasOwn(p, "accountWinRate") ? { accountWinRate: p.accountWinRate } : {}),
  }))

  const nextSelf = {
    uuid: self.uuid,
    nickname: self.nickname,
    role: self.role,
    team: self.team,
    hasActedThisPhase: self.hasActedThisPhase,
    ...(Object.hasOwn(self, "accountSkinId") ? { accountSkinId: self.accountSkinId } : {}),
    // F-21(AC-03): **본인의** 정규화된 제출 상태. hasActedThisPhase는 "무언가 했다"만 말하므로,
    // 표적이 이탈로 기권(null)으로 정규화된 뒤 새로고침하면 화면이 서버가 이미 지운 선택을
    // 그대로 그린 채 남는다. 서버가 실어 준 필드만 옮긴다(없으면 키도 만들지 않는다).
    ...copySelfSubmissionFields(self),
    ...(self.role === "JOKER" ? { allies } : {}),
  }

  // F-21(AC-01): 방장과 참여 세대는 서버가 유일한 원천이다. 새로고침으로 메모리 store가
  // 비어도 이 값으로 방관리 권한이 복원되고, 모양이 틀린 값은 null로 두어 "모른다"와
  // "방장이다"를 섞지 않는다(fail-closed).
  const hostUuid = isNonEmptyString(response.hostUuid) ? response.hostUuid : null
  const participationRevision = isNonNegativeInteger(response.participationRevision)
    ? response.participationRevision
    : 0

  /**
   * F-21(AC-03/AC-05): **참여 세대가 뒷걸음질치는 스냅샷은 적용하지 않는다.**
   *
   * 여기까지 오는 검사(gameId·phase·dayIndex·roster uuid 집합)는 전부 "같은 판의 같은 단계"를
   * 확인할 뿐이다. 추방 **직전에** 서버가 만든 스냅샷이 추방 사건보다 늦게 도착하면 그 값들이
   * 전부 일치하므로 통과하고, 이미 반영된 참여 종료·방장 승계·정규화된 본인 표를 옛 roster와
   * 옛 host로 되돌린다. 세대가 그것을 구별하는 유일한 값이다.
   *
   * 같은 세대의 재적용은 막지 않는다(멱등 복원은 정상 경로다). 세대를 싣지 않은 스냅샷도
   * 막지 않는다 — 다만 현재 화면이 이미 세대를 갖고 있으면 그 스냅샷은 그보다 옛것이므로
   * 되돌릴 수 없다(fail-closed).
   */
  const currentRevision = current.state.participationRevision ?? 0
  if (participationRevision < currentRevision) return current
  if (!isNonNegativeInteger(response.participationRevision) && currentRevision > 0) return current

  /**
   * F-21(AC-03/AC-05): **본인 제출 상태가 뒷걸음질치는 스냅샷도 적용하지 않는다.**
   *
   * 참여 세대는 이탈에서만 오른다. 스냅샷 조회를 보낸 뒤에 낸 평범한 제출은 세대를 바꾸지
   * 않으므로, 위 검사를 통과한 옛 스냅샷이 방금 낸 표를 "미제출"로 되돌릴 수 있었다. 개인
   * 값의 순서는 개인 값의 시계(selfProgressSeq)로만 판정한다 — 같은 값의 재적용(멱등 복원)은
   * 그대로 허용하고, 순서값을 싣지 않은 스냅샷은 이미 순서를 아는 화면에서만 막는다.
   */
  const selfProgressSeq = isNonNegativeInteger(response.selfProgressSeq) ? response.selfProgressSeq : 0
  const currentSelfProgressSeq = current.state.selfProgressSeq ?? 0
  if (selfProgressSeq < currentSelfProgressSeq) return current
  if (!isNonNegativeInteger(response.selfProgressSeq) && currentSelfProgressSeq > 0) return current

  const nextState = {
    id: response.gameId,
    phase: response.phase,
    dayIndex: response.dayIndex,
    dayPhase,
    hostUuid,
    // 진행 중 추방 요청이 "내가 보고 있던 그 판"을 가리킨다는 것을 서버가 확인하는 입력이다.
    // 새로고침으로 이 세 값이 사라지면 방장이 추방 요청 자체를 만들 수 없다.
    roomId: isNonEmptyString(response.roomId) ? response.roomId : null,
    roomInstanceId: isNonEmptyString(response.roomInstanceId) ? response.roomInstanceId : null,
    bootEpoch: isNonEmptyString(response.bootEpoch) ? response.bootEpoch : null,
    // F-24(AC-01): 진행 중·종료 직후의 "방 코드 보기"가 새로고침 뒤에도 같은 값을 얻는다.
    // 모양이 틀린 값은 null이다 — 화면은 그때 "확인할 수 없음"을 보여준다(더미를 만들지 않는다).
    roomCode: isNonEmptyString(response.roomCode) ? response.roomCode : null,
    // F-24(AC-04/RESTORE-24): 다음 방 설정 복원의 원본. 응답을 통째로 참조하지 않고 세 값만
    // 새 구조로 옮긴다 — 허용 목록 밖의 폐기된 키는 여기서 상태로 만들어지지 않는다.
    roomSettingsSource: normalizeRoomSettingsSource(response.roomSettingsSource),
    participationRevision,
    // 개인 제출 상태의 순서값. 이 값을 이어 두지 않으면 다음에 도착하는 옛 개인 사건이
    // 복원된 상태를 되돌릴 수 있다(store의 applySelfProgress가 같은 값을 본다).
    selfProgressSeq,
    players: nextPlayers,
    self: nextSelf,
    tribunal,
    winResult,
    nightResult,
    dayVoteResolution,
    dayVoteRound: dayVoteResolution?.outcome === "REVOTE" ? dayVoteResolution.round + 1 : (dayVoteResolution?.round ?? 1),
    dayVoteExcludedUuids: dayVoteResolution?.outcome === "REVOTE" ? [...dayVoteResolution.revoteExcludedUuids] : [],
    // F-21(AC-03): 이탈로 분모가 줄어든 단계의 공개 진행 수. 서버가 싣지 않았으면 키를 만들지
    // 않는다(화면이 스스로 세지 않고 "모른다"로 둔다).
    ...(isPublicProgress(response.progress) ? { progress: { ...response.progress } } : {}),
  }

  // 최상위 hostUuid도 함께 돌려준다 — useInGameSettingIsHost가 읽는 값이고, 스냅샷 복원이
  // 그 값을 채우지 않으면 새로고침한 방장이 방관리 탭을 잃는다(이 계약 이전의 실제 동작이다).
  return { state: nextState, hostUuid }
}
