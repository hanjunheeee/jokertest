// 직업 구성 계산: 처음 값·특수 직업 합·시민 수·직접 지정 검사·직업별 인원 범위
// RoleCompositionSection·useRoleCompositionState·formState가 씀, 시험도 씀
import {
  CUSTOM_ROLE_KEYS,
  MAX_CUSTOM_JOKER_COUNT,
  MAX_SPECIAL_ROLE_COUNT,
  MIN_CUSTOM_JOKER_COUNT,
  ROLE_COMPOSITION_MODES,
  DEFAULT_CUSTOM_ROLE_COUNTS,
} from "../constants/roleComposition.js"
import { isNonNegativeInteger } from "../../shared/utils/valueChecks.js"

// 직접 지정 처음 값 (사본)
export function createDefaultCustomRoleCounts() {
  return { ...DEFAULT_CUSTOM_ROLE_COUNTS }
}

// 특수 직업 인원 합 (숫자 아닌 값 있으면 NaN)
export function getFixedRoleCount(roleCounts) {
  return CUSTOM_ROLE_KEYS.reduce((sum, key) => {
    const value = roleCounts?.[key]
    return sum + (typeof value === "number" ? value : NaN)
  }, 0)
}

// 남는 시민 수 (계산 못 하거나 모자라면 null)
export function deriveCitizenCount(maxPlayers, roleCounts) {
  if (!Number.isInteger(maxPlayers)) return null
  const fixed = getFixedRoleCount(roleCounts)
  if (!Number.isInteger(fixed)) return null
  const citizen = maxPlayers - fixed
  return citizen < 0 ? null : citizen
}

// 직접 지정 오류 문구
export const ERROR_MSGS = Object.freeze({
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

// 직접 지정 검사 (자동이면 늘 통과)
export function validateRoleComposition({ mode, roleCounts, maxPlayers }) {
  if (mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: true }

  // 실패 결과 만들기
  const fail = (code) => ({ ok: false, code, message: ERROR_MSGS[code] })

  // 최대 인원·직업 수 모양 확인
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
  // 광대 최소·최대, 특수 직업 상한
  if (roleCounts.JOKER < MIN_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_TOO_LOW")
  if (roleCounts.JOKER > MAX_CUSTOM_JOKER_COUNT) return fail("JOKER_COUNT_ABOVE_LIMIT")
  if (CUSTOM_ROLE_KEYS.some((key) => roleCounts[key] > MAX_SPECIAL_ROLE_COUNT)) {
    return fail("SPECIAL_ROLE_COUNT_ABOVE_LIMIT")
  }
  // 광대는 최대 인원보다 적고, 특수 직업 합은 최대 인원 이하
  if (roleCounts.JOKER >= maxPlayers) return fail("JOKER_COUNT_TOO_HIGH")
  if (getFixedRoleCount(roleCounts) > maxPlayers) return fail("FIXED_ROLES_EXCEED_MAX_PLAYERS")

  return { ok: true }
}

// 직업별 고를 수 있는 인원 범위 (광대는 최소 1, 최대 인원보다 하나 적게)
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
