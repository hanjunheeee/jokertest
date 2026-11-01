// 방 설정 원본 정리: 허용한 키·값만 남기고 버린 게 있는지 알림
// 설정 유지 스토어·nextRoomRecord·인게임 스냅샷 설정 정리가 씀
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../constants/gameSetupOptions.js"
import { isPlainObject } from "../../shared/utils/valueChecks.js"

// 남겨도 되는 설정 키
export const ALLOWED_SETTING_KEYS = Object.freeze([
  "maxPlayers",
  "jokerCount",
  "roleCompositionMode",
  "roleCounts",
  "dayDiscussionTime",
  "dayVoteTime",
  "nightActionTime",
  "roleNightActionTimes",
  "lightsOut",
  "soulBetting",
  "voteReveal",
])

// 원본 맨 위에 있어도 되는 키
export const ALLOWED_SOURCE_KEYS = Object.freeze(["accessType", "settingsVersion", "settings"])

// 직업별 밤 시간에 올 수 있는 직업
const ALLOWED_ROLE_TIME_KEYS = Object.freeze(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role }) => role))

// 직업 이름 → 정수 꼴인 안쪽 표
const NESTED_ROLE_MAPS = Object.freeze({
  roleCounts: CUSTOM_ROLE_KEYS,
  roleNightActionTimes: ALLOWED_ROLE_TIME_KEYS,
})

// 숫자·참거짓·문자열만 허용
function isAllowedScalar(value) {
  return typeof value === "number" || typeof value === "boolean" || typeof value === "string"
}

// 직업 표 정리: 허용 직업의 정수 값만
function sanitizeRoleMap(source, allowedRoles) {
  let dropped = false
  const map = {}
  for (const [role, value] of Object.entries(source)) {
    if (!allowedRoles.includes(role) || !Number.isInteger(value)) {
      dropped = true
      continue
    }
    map[role] = value
  }
  return { map, dropped }
}

// 설정 정리 (설정이 객체 아니면 빈 설정)
export function sanitizeRoomSettings(settings) {
  const source = isPlainObject(settings) ? settings : {}
  let dropped = false
  const view = {}

  for (const [key, value] of Object.entries(source)) {
    // 허용 밖 키 버림
    if (!ALLOWED_SETTING_KEYS.includes(key)) {
      dropped = true
      continue
    }
    // 직업 표는 안쪽까지 정리
    if (Object.hasOwn(NESTED_ROLE_MAPS, key)) {
      if (!isPlainObject(value)) {
        dropped = true
        continue
      }
      const nested = sanitizeRoleMap(value, NESTED_ROLE_MAPS[key])
      if (nested.dropped) dropped = true
      view[key] = nested.map
      continue
    }
    // 그 밖 값은 단순 값만
    if (!isAllowedScalar(value)) {
      dropped = true
      continue
    }
    view[key] = value
  }

  return { settings: view, dropped }
}

// 복원 원본 정리: 공개 방식·필수 숫자·구성 방식이 맞아야 ok
export function sanitizeRestoreSource(source) {
  if (!isPlainObject(source)) return { ok: false }
  const { accessType, settingsVersion } = source
  if (accessType !== "open" && accessType !== "code") return { ok: false }
  if (!isPlainObject(source.settings)) return { ok: false }

  const { settings, dropped } = sanitizeRoomSettings(source.settings)
  // 필수 숫자 항목은 정수여야 함
  for (const key of ["maxPlayers", "jokerCount", "dayDiscussionTime", "dayVoteTime", "nightActionTime"]) {
    if (!Number.isInteger(settings[key])) return { ok: false }
  }
  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: false }

  // 맨 위에 허용 밖 키가 있었는지
  const topLevelDropped = Object.keys(source).some((key) => !ALLOWED_SOURCE_KEYS.includes(key))

  return {
    ok: true,
    source: {
      accessType,
      settingsVersion: Number.isInteger(settingsVersion) ? settingsVersion : null,
      settings,
    },
    dropped: dropped || topLevelDropped,
  }
}
