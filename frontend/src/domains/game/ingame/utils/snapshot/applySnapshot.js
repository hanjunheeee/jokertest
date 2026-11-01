// 세션 스냅샷 반영 계산: 판이 있을 때 반영·빈 스토어 채우기 (상태를 안 건드리는 순수 계산)
// store/applySessionSnapshot.js가 다시 내보내고, 스냅샷 액션과 시험이 사용
import {
  KNOWN_PHASES,
  PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS,
} from "../../constants/store/sessionSnapshot.js"
import { isPublicProgress } from "../store/gamePayload.js"
import { BAD, isNonEmptyString, isNonNegativeInteger, isPlainObject } from "./checks.js"
import { buildPlayers, readRoster } from "./roster.js"
import { buildSelf, readSelf } from "./self.js"
import { readDayFields } from "./dayFields.js"
import { goesBackward, readDayPhase, readVersions, readWinResult } from "./phaseFields.js"
import { normalizeRoomSettingsSource } from "./roomSettings.js"

// 빈 문자열이면 null로
const orNull = (value) => (isNonEmptyString(value) ? value : null)

// 스냅샷 반영: 맞는 응답이면 { state, hostUuid } 조각, 하나라도 틀리면 current 그대로
export function applySessionSnapshotPure(current, response) {
  // 응답 성공·단계·날짜
  if (!isPlainObject(response)) return current
  if (response.ok !== true) return current
  if (typeof response.phase !== "string" || !KNOWN_PHASES.has(response.phase)) return current
  if (!isNonNegativeInteger(response.dayIndex)) return current

  // 지금 판과 같은 판
  if (!current.gameId || !current.state) return current
  if (!isNonEmptyString(current.gameId) || !isNonEmptyString(response.gameId)) return current
  if (response.gameId !== current.gameId) return current

  // 명단·본인
  const roster = readRoster(response.players, current.state.players)
  if (roster === BAD) return current
  const allies = readSelf(response.self, roster, current.state.self?.uuid)
  if (allies === BAD) return current

  // 밤 결과·낮 투표 판정·재판 (역할 공개·밤엔 오면 안 됨)
  const day = readDayFields(response, roster, !PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS.has(response.phase))
  if (day === BAD) return current

  // 승패·낮 단계·역행
  const winResult = readWinResult(response)
  if (winResult === BAD) return current
  const dayPhase = readDayPhase(response)
  if (dayPhase === BAD) return current
  if (goesBackward(current.state, response)) return current

  // 참여 버전·본인 진행 순번
  const versions = readVersions(response, current.state)
  if (versions === BAD) return current

  const hostUuid = orNull(response.hostUuid)
  const { dayVoteResolution } = day
  const nextState = {
    id: response.gameId,
    phase: response.phase,
    dayIndex: response.dayIndex,
    dayPhase,
    hostUuid,
    roomId: orNull(response.roomId),
    roomInstanceId: orNull(response.roomInstanceId),
    bootEpoch: orNull(response.bootEpoch),
    roomCode: orNull(response.roomCode),
    roomSettingsSource: normalizeRoomSettingsSource(response.roomSettingsSource),
    participationRevision: versions.participationRevision,
    selfProgressSeq: versions.selfProgressSeq,
    players: buildPlayers(response.players, current.state.players),
    self: buildSelf(response.self, allies),
    tribunal: day.tribunal,
    winResult,
    nightResult: day.nightResult,
    dayVoteResolution,
    dayVoteRound: dayVoteResolution?.outcome === "REVOTE" ? dayVoteResolution.round + 1 : (dayVoteResolution?.round ?? 1),
    dayVoteExcludedUuids: dayVoteResolution?.outcome === "REVOTE" ? [...dayVoteResolution.revoteExcludedUuids] : [],
    ...(isPublicProgress(response.progress) ? { progress: { ...response.progress } } : {}),
  }

  return { state: nextState, hostUuid }
}

// 빈 스토어 채우기: 응답의 판·명단·본인으로 씨앗을 만들고 반영 (틀리면 null)
export function bootstrapSessionSnapshotPure(response) {
  if (!isPlainObject(response)) return null
  if (!isNonEmptyString(response.gameId)) return null
  if (!Array.isArray(response.players) || response.players.length === 0) return null
  if (!isPlainObject(response.self)) return null
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
