import {
  CUSTOM_ROLE_KEYS,
  MAX_CUSTOM_JOKER_COUNT,
  MAX_SPECIAL_ROLE_COUNT,
  MIN_CUSTOM_JOKER_COUNT,
  ROLE_COMPOSITION_MODES,
  DEFAULT_CUSTOM_ROLE_COUNTS,
} from "../constants/roleComposition.js"
import { isNonNegativeInteger } from "../../shared/utils/valueChecks.js"

export function createDefaultCustomRoleCounts() {
  return { ...DEFAULT_CUSTOM_ROLE_COUNTS }
}

export function getFixedRoleCount(roleCounts) {
  return CUSTOM_ROLE_KEYS.reduce((sum, key) => {
    const value = roleCounts?.[key]
    return sum + (typeof value === "number" ? value : NaN)
  }, 0)
}

export function deriveCitizenCount(maxPlayers, roleCounts) {
  if (!Number.isInteger(maxPlayers)) return null
  const fixed = getFixedRoleCount(roleCounts)
  if (!Number.isInteger(fixed)) return null
  const citizen = maxPlayers - fixed
  return citizen < 0 ? null : citizen
}

export const ROLE_COMPOSITION_ERROR_MESSAGES = Object.freeze({
  INVALID_MAX_PLAYERS: "최대 플레이어 수가 올바르지 않습니다.",
  ROLE_COUNTS_NOT_OBJECT: "역할 구성 값이 올바르지 않습니다.",
  UNKNOWN_ROLE_KEY: "지정할 수 없는 역할이 포함되어 있습니다.",
  INVALID_ROLE_COUNT: "역할별 인원은 0 이상의 정수여야 합니다.",
  JOKER_COUNT_TOO_LOW: `광대는 최소 ${MIN_CUSTOM_JOKER_COUNT}명이어야 합니다.`,
  JOKER_COUNT_TOO_HIGH: "광대 수는 최대 플레이어 수보다 적어야 합니다.",
  JOKER_COUNT_ABOVE_LIMIT: `광대는 최대 ${MAX_CUSTOM_JOKER_COUNT}명까지 지정할 수 있습니다.`,
  SPECIAL_ROLE_COUNT_ABOVE_LIMIT: `특수직업은 각각 최대 ${MAX_SPECIAL_ROLE_COUNT}명까지 지정할 수 있습니다.`,
  FIXED_ROLES_EXCEED_MAX_PLAYERS: "지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.",
})

export function validateRoleComposition({ mode, roleCounts, maxPlayers }) {
  if (mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: true }

  const fail = (code) => ({ ok: false, code, message: ROLE_COMPOSITION_ERROR_MESSAGES[code] })

  if (!Number.isInteger(maxPlayers) || maxPlayers < 1) return fail("INVALID_MAX_PLAYERS")
  if (typeof roleCounts !== "object" || roleCounts === null || Array.isArray(roleCounts)) {
    return fail("ROLE_COUNTS_NOT_OBJECT")
  }
  for (const key of Object.keys(roleCounts)) {
    if (!CUSTOM_ROLE_KEYS.includes(key)) return fail("UNKNOWN_ROLE_KEY")
  }
  for (const key of CUSTOM_ROLE_KEYS) {
    if (!isNonNegativeInteger(roleCounts[key])) return fail("INVALID_ROLE_COUNT")
  }
  if (roleCounts.JOKER < MIN_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_TOO_LOW")
  if (roleCounts.JOKER > MAX_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_ABOVE_LIMIT")
  if (CUSTOM_ROLE_KEYS.some((key) => roleCounts[key] > MAX_SPECIAL_ROLE_COUNT)) {
    return fail("SPECIAL_ROLE_COUNT_ABOVE_LIMIT")
  }
  if (roleCounts.JOKER >= maxPlayers) return fail("JOKER_COUNT_TOO_HIGH")
  if (getFixedRoleCount(roleCounts) > maxPlayers) return fail("FIXED_ROLES_EXCEED_MAX_PLAYERS")

  return { ok: true }
}

export function getRoleCountRange(roleKey, maxPlayers) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
    return { min: 0, max: 0 }
  }
  if (roleKey === "JOKER") {
    return {
      min: MIN_CUSTOM_JOKER_COUNT,
      max: Math.max(MIN_CUSTOM_JOKER_COUNT, Math.min(maxPlayers - 1, MAX_CUSTOM_JOKER_COUNT)),
    }
  }
  return { min: 0, max: Math.min(maxPlayers, MAX_SPECIAL_ROLE_COUNT) }
}
