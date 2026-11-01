import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../constants/gameSetupOptions.js"
import { isPlainObject } from "../../shared/utils/valueChecks.js"

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

export const ALLOWED_SOURCE_KEYS = Object.freeze(["accessType", "settingsVersion", "settings"])

const ALLOWED_ROLE_TIME_KEYS = Object.freeze(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role }) => role))

const NESTED_ROLE_MAPS = Object.freeze({
  roleCounts: CUSTOM_ROLE_KEYS,
  roleNightActionTimes: ALLOWED_ROLE_TIME_KEYS,
})

function isAllowedScalar(value) {
  return typeof value === "number" || typeof value === "boolean" || typeof value === "string"
}

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

export function sanitizeRoomSettings(settings) {
  const source = isPlainObject(settings) ? settings : {}
  let dropped = false
  const view = {}

  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_SETTING_KEYS.includes(key)) {
      dropped = true
      continue
    }
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
    if (!isAllowedScalar(value)) {
      dropped = true
      continue
    }
    view[key] = value
  }

  return { settings: view, dropped }
}

export function sanitizeRestoreSource(source) {
  if (!isPlainObject(source)) return { ok: false }
  const { accessType, settingsVersion } = source
  if (accessType !== "open" && accessType !== "code") return { ok: false }
  if (!isPlainObject(source.settings)) return { ok: false }

  const { settings, dropped } = sanitizeRoomSettings(source.settings)
  for (const key of ["maxPlayers", "jokerCount", "dayDiscussionTime", "dayVoteTime", "nightActionTime"]) {
    if (!Number.isInteger(settings[key])) return { ok: false }
  }
  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: false }

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
