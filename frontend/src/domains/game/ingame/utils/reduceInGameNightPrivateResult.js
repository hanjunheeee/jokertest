import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

const OWNER_ROLE_BY_ACTION_TYPE = Object.freeze({
  INVESTIGATE: "GUARD",
  CONFIRM: "WITCH_HUNTER",
  ASSASSINATE: "JOKER",
})

const TARGETED_ACTION_TYPES = new Set(["INVESTIGATE", "CONFIRM"])

export const INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL =
  "이번 밤의 암살이 실패했습니다."

export function parseInGameNightPrivateResultPayload({
  payload,
  gameId,
  dayIndex,
  phase,
  selfRole,
  selfUuid = null,
  selfAlive = null,
}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return null

  if (phase !== "NIGHT") return null
  if (!Number.isInteger(dayIndex)) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  const ownerRole = OWNER_ROLE_BY_ACTION_TYPE[payload.actionType]
  if (ownerRole === undefined) return null
  if (typeof selfRole !== "string" || selfRole !== ownerRole) return null

  if (selfAlive === false) return null

  if (TARGETED_ACTION_TYPES.has(payload.actionType)) {
    if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null
    if (typeof selfUuid === "string" && selfUuid.length > 0 && payload.targetId === selfUuid) {
      return null
    }
    if (getInGameRoleRevealDisplay(payload.role) === null) return null
    return {
      gameId: payload.gameId,
      dayIndex: payload.dayIndex,
      actionType: payload.actionType,
      targetId: payload.targetId,
      role: payload.role,
    }
  }

  if (payload.success !== false) return null
  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    actionType: payload.actionType,
    targetId: null,
    role: null,
  }
}

export function reduceInGameNightPrivateResult(payload, players) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!Array.isArray(players)) return null

  if (payload.actionType === "ASSASSINATE") {
    if (payload.success !== undefined && payload.success !== false) return null
    return {
      kind: "ASSASSINATE",
      targetNickname: null,
      label: INGAME_NIGHT_PRIVATE_RESULT_ASSASSINATION_FAILED_LABEL,
    }
  }

  if (!TARGETED_ACTION_TYPES.has(payload.actionType)) return null
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null

  const target = players.find((p) => p && p.uuid === payload.targetId) ?? null
  if (target === null) return null
  if (typeof target.nickname !== "string" || target.nickname.length === 0) return null

  const display = getInGameRoleRevealDisplay(payload.role)
  if (display === null) return null

  const verb = payload.actionType === "INVESTIGATE" ? "조사" : "확인"
  return {
    kind: payload.actionType,
    targetNickname: target.nickname,
    label: `${verb} 결과, ${target.nickname} 님의 역할은 ${display.name}입니다.`,
  }
}
