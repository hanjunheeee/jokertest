// game-core/gameSession.js의 ROLE_TEAMS와 값이 일치해야 한다 — 이 프로젝트에는 백엔드/프런트가
// 공유하는 상수 모듈이 없어 수동으로 동기화한다(buildPlayerSessionSourceFromGameState.js와 동일한
// 관례로 이 파일에도 독립적으로 복제한다).
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

const KNOWN_PHASES = new Set(["ROLE_REVEAL", "NIGHT", "DAY", "TRIBUNAL", "ENDED"])
// 이 두 phase에서는 밤 사이 아직 낮/재판 관련 결과가 존재할 수 없다(game-core의
// canIncludeDayTribunalFields와 동일한 게이트) — nightResult/dayVoteResolution/tribunal
// 모두 이 phase에서는 반드시 없어야 한다.
const PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS = new Set(["ROLE_REVEAL", "NIGHT"])
const DAY_VOTE_OUTCOMES = new Set(["ABSTAINED", "TIE", "TRIBUNAL"])
const TRIBUNAL_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
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
 * 변형해도 store에는 영향이 없다.
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
  }

  let dayVoteResolution = null
  if (Object.hasOwn(response, "dayVoteResolution")) {
    if (!dayTribunalFieldsAllowed) return current
    const raw = response.dayVoteResolution
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return current
    if (!DAY_VOTE_OUTCOMES.has(raw.outcome)) return current
    if (raw.outcome === "TRIBUNAL") {
      if (!isNonEmptyString(raw.tribunalTargetUuid)) return current
      if (!rosterByUuid.has(raw.tribunalTargetUuid)) return current
    } else if (raw.tribunalTargetUuid !== null) {
      return current
    }
    if (!isNonNegativeInteger(raw.publicVoteCount) || !isNonNegativeInteger(raw.publicAbstainCount)) return current
    dayVoteResolution = {
      outcome: raw.outcome,
      tribunalTargetUuid: raw.outcome === "TRIBUNAL" ? raw.tribunalTargetUuid : null,
      publicVoteCount: raw.publicVoteCount,
      publicAbstainCount: raw.publicAbstainCount,
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

  // 종료(ENDED) 확정 이후에는 어떤 스냅샷도 활성 phase로 되돌릴 수 없다(잠금). 동일하게
  // ENDED인 스냅샷을 다시 적용하는 것은 막지 않는다(멱등 재적용 허용).
  if (current.state.phase === "ENDED" && response.phase !== "ENDED") return current

  const nextPlayers = response.players.map((p) => ({
    uuid: p.uuid,
    nickname: p.nickname,
    alive: p.isAlive,
    isConnected: p.isConnected,
  }))

  const nextSelf = {
    uuid: self.uuid,
    nickname: self.nickname,
    role: self.role,
    team: self.team,
    hasActedThisPhase: self.hasActedThisPhase,
    ...(self.role === "JOKER" ? { allies } : {}),
  }

  const nextState = {
    id: response.gameId,
    phase: response.phase,
    dayIndex: response.dayIndex,
    players: nextPlayers,
    self: nextSelf,
    tribunal,
    winResult,
    nightResult,
    dayVoteResolution,
  }

  return { state: nextState }
}
