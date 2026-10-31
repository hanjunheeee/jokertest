import { parseDayVoteRoundFields } from "../utils/dayVoteRound.js"
import { normalizeInGameNightDeathReveals } from "../utils/normalizeInGameNightDeathReveals.js"
import { normalizePublicWinResult } from "../utils/normalizePublicWinResult.js"
import { sanitizeRoomSettings } from "../../setup/utils/roomSettingsSourceSanitize.js"

const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

const KNOWN_PHASES = new Set(["ROLE_REVEAL", "NIGHT", "DAY", "TRIBUNAL", "ENDED"])
const PHASE_PROGRESS_RANK = Object.freeze({
  ROLE_REVEAL: 0, DAY: 1, TRIBUNAL: 2, NIGHT: 3, ENDED: 4,
})
const PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS = new Set(["ROLE_REVEAL", "NIGHT"])
const KNOWN_DAY_PHASES = new Set(["DAY_DISCUSSION", "DAY_VOTE"])
const DAY_VOTE_OUTCOMES = new Set(["ABSTAINED", "TIE", "TRIBUNAL", "REVOTE"])
const TRIBUNAL_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

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

export function normalizeRoomSettingsSourceForStore(raw) {
  return normalizeRoomSettingsSource(raw)
}

function normalizeRoomSettingsSource(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (raw.settings === null || typeof raw.settings !== "object" || Array.isArray(raw.settings)) return null
  if (raw.accessType !== "open" && raw.accessType !== "code") return null
  const { settings } = sanitizeRoomSettings(raw.settings)
  return {
    accessType: raw.accessType,
    settingsVersion: isNonNegativeInteger(raw.settingsVersion) ? raw.settingsVersion : null,
    settings,
  }
}

function isPublicProgress(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (!isNonEmptyString(value.kind)) return false
  const okCount = (n) => n === null || isNonNegativeInteger(n)
  return okCount(value.doneCount) && okCount(value.requiredCount)
}

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

export function applySessionSnapshotPure(current, response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return current
  if (response.ok !== true) return current
  if (typeof response.phase !== "string" || !KNOWN_PHASES.has(response.phase)) return current
  if (!isNonNegativeInteger(response.dayIndex)) return current

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
    if (Object.hasOwn(player, "isParticipating") && typeof player.isParticipating !== "boolean") return current
    if (Object.hasOwn(player, "membershipId") && player.membershipId !== null && !isNonEmptyString(player.membershipId)) return current
    if (Object.hasOwn(player, "themeIndex") && !isNonNegativeInteger(player.themeIndex)) return current
    if (Object.hasOwn(player, "accountProfilePhotoId") && !isNonEmptyString(player.accountProfilePhotoId)) return current
    if (Object.hasOwn(player, "accountProfileBorderId") && !isNonEmptyString(player.accountProfileBorderId)) return current
    if (Object.hasOwn(player, "accountCardFrameId") && player.accountCardFrameId !== null && !isNonEmptyString(player.accountCardFrameId)) return current
    if (Object.hasOwn(player, "accountTotalGames") && !isNonNegativeInteger(player.accountTotalGames)) return current
    if (Object.hasOwn(player, "accountWinRate")
      && (!isNonNegativeInteger(player.accountWinRate) || player.accountWinRate > 100)) return current
    if (rosterByUuid.has(player.uuid)) return current
    rosterByUuid.set(player.uuid, player)
  }
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
  if (self.uuid !== current.state.self?.uuid) return current
  if (rosterByUuid.get(self.uuid).nickname !== self.nickname) return current

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
    if (!isNonNegativeInteger(raw.dayIndex) || raw.dayIndex !== response.dayIndex) return current
    if (raw.victimUuid !== null && !isNonEmptyString(raw.victimUuid)) return current
    if (raw.victimUuid !== null && !rosterByUuid.has(raw.victimUuid)) return current
    nightResult = { dayIndex: raw.dayIndex, victimUuid: raw.victimUuid }
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

  if (dayVoteResolution !== null && tribunal !== null) {
    if (dayVoteResolution.outcome !== "TRIBUNAL") return current
    if (dayVoteResolution.tribunalTargetUuid !== tribunal.defendantUuid) return current
  }

  let winResult = null
  if (response.phase === "ENDED") {
    if (!Object.hasOwn(response, "winResult") || response.winResult === null) {
      return current
    }
    const normalizedWinResult = normalizePublicWinResult(response.winResult)
    if (normalizedWinResult === null) {
      return current
    }
    winResult = normalizedWinResult
  } else if (Object.hasOwn(response, "winResult")) {
    return current
  }

  let dayPhase = null
  if (response.phase === "DAY") {
    if (!Object.hasOwn(response, "dayPhase") || !KNOWN_DAY_PHASES.has(response.dayPhase)) return current
    dayPhase = response.dayPhase
  } else if (Object.hasOwn(response, "dayPhase")) {
    return current
  }

  if (current.state.phase === "ENDED" && response.phase !== "ENDED") return current

  const currentDayIndex = current.state.dayIndex
  if (isNonNegativeInteger(currentDayIndex)) {
    if (response.dayIndex < currentDayIndex) return current
    if (response.dayIndex === currentDayIndex) {
      const currentRank = PHASE_PROGRESS_RANK[current.state.phase]
      const responseRank = PHASE_PROGRESS_RANK[response.phase]
      if (currentRank !== undefined && responseRank !== undefined && responseRank < currentRank) return current
    }
  }

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
    isParticipating: p.isParticipating !== false,
    ...(Object.hasOwn(p, "membershipId") ? { membershipId: p.membershipId } : {}),
    ...(isNonNegativeInteger(p.themeIndex)
      ? { themeIndex: p.themeIndex }
      : themeIndexByUuid.has(p.uuid)
        ? { themeIndex: themeIndexByUuid.get(p.uuid) }
        : {}),
    ...(Object.hasOwn(p, "accountProfilePhotoId") ? { accountProfilePhotoId: p.accountProfilePhotoId } : {}),
    ...(Object.hasOwn(p, "accountProfileBorderId") ? { accountProfileBorderId: p.accountProfileBorderId } : {}),
    ...(Object.hasOwn(p, "accountCardFrameId") ? { accountCardFrameId: p.accountCardFrameId } : {}),
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
    ...copySelfSubmissionFields(self),
    ...(self.role === "JOKER" ? { allies } : {}),
  }

  const hostUuid = isNonEmptyString(response.hostUuid) ? response.hostUuid : null
  const participationRevision = isNonNegativeInteger(response.participationRevision)
    ? response.participationRevision
    : 0

  const currentRevision = current.state.participationRevision ?? 0
  if (participationRevision < currentRevision) return current
  if (!isNonNegativeInteger(response.participationRevision) && currentRevision > 0) return current

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
    roomId: isNonEmptyString(response.roomId) ? response.roomId : null,
    roomInstanceId: isNonEmptyString(response.roomInstanceId) ? response.roomInstanceId : null,
    bootEpoch: isNonEmptyString(response.bootEpoch) ? response.bootEpoch : null,
    roomCode: isNonEmptyString(response.roomCode) ? response.roomCode : null,
    roomSettingsSource: normalizeRoomSettingsSource(response.roomSettingsSource),
    participationRevision,
    selfProgressSeq,
    players: nextPlayers,
    self: nextSelf,
    tribunal,
    winResult,
    nightResult,
    dayVoteResolution,
    dayVoteRound: dayVoteResolution?.outcome === "REVOTE" ? dayVoteResolution.round + 1 : (dayVoteResolution?.round ?? 1),
    dayVoteExcludedUuids: dayVoteResolution?.outcome === "REVOTE" ? [...dayVoteResolution.revoteExcludedUuids] : [],
    ...(isPublicProgress(response.progress) ? { progress: { ...response.progress } } : {}),
  }

  return { state: nextState, hostUuid }
}
