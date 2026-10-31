import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import {
  GENERAL_GAME_SETUP,
  MEETING_GAME_SETUP,
  ROLE_NIGHT_ACTION_TIME_OPTIONS,
} from "../constants/gameSetupOptions.js"
import { validateRoleComposition } from "./roleComposition.js"

export const OVERALL_NIGHT_ACTION_TIME_ID = "night-action-time"

const RANGE_ID_TO_SETTING_KEY = Object.freeze({
  "max-players": "maxPlayers",
  "joker-count": "jokerCount",
  "day-discussion-time": "dayDiscussionTime",
  "day-vote-time": "dayVoteTime",
  [OVERALL_NIGHT_ACTION_TIME_ID]: "nightActionTime",
})

const CHECK_ID_TO_SETTING_KEY = Object.freeze({
  "lights-out": "lightsOut",
  "soul-betting": "soulBetting",
  "vote-reveal": "voteReveal",
})

export const NON_EDITABLE_SETUP_ITEM_IDS = Object.freeze(["lights-out", "soul-betting", "vote-reveal"])

const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

const ROLE_TO_NIGHT_TIME_ID = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [role, id])),
)

export const NIGHT_TIME_ID_TO_ROLE = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [id, role])),
)

export function mergeSpecifiedRoleNightActionTimes(serverSpecified, editedRoleTimeIds) {
  if (!Array.isArray(serverSpecified)) return undefined
  return ROLE_NIGHT_ACTION_TIME_OPTIONS
    .filter(({ role, id }) => serverSpecified.includes(role) || editedRoleTimeIds?.has?.(id) === true)
    .map(({ role }) => role)
}

export const ROOM_SETTINGS_FORM_ERROR_CODES = Object.freeze({
  NOT_OBJECT: "NOT_OBJECT",
  INVALID_ACCESS_TYPE: "INVALID_ACCESS_TYPE",
  MISSING_FIELD: "MISSING_FIELD",
  OUT_OF_RANGE: "OUT_OF_RANGE",
  INVALID_ROLE_COUNTS: "INVALID_ROLE_COUNTS",
  INVALID_ROLE_MODE: "INVALID_ROLE_MODE",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const STEPPER_ITEMS_BY_ID = Object.freeze(Object.fromEntries(
  [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]
    .filter((item) => item.type === "stepper")
    .map((item) => [item.id, item]),
))

function isRepresentableStepperValue(id, value) {
  const item = STEPPER_ITEMS_BY_ID[id]
  if (!item) return false
  if (!Number.isInteger(value)) return false
  if (value < item.min || value > item.max) return false
  const step = Number.isInteger(item.step) && item.step > 0 ? item.step : 1
  return (value - item.min) % step === 0
}

export function buildDefaultSetupFormState(items = ALL_SETUP_ITEMS) {
  const checks = {}
  const ranges = {}
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

export function buildRoomSettingsFormState(source) {
  if (!isPlainObject(source) || !isPlainObject(source.settings)) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.NOT_OBJECT }
  }
  const { accessType, settings } = source

  if (accessType !== "open" && accessType !== "code") {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ACCESS_TYPE }
  }

  const { checks, ranges } = buildDefaultSetupFormState()

  checks["private-lobby"] = accessType === "code"

  for (const [id, key] of Object.entries(RANGE_ID_TO_SETTING_KEY)) {
    const value = settings[key]
    if (value === undefined) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: key }
    }
    if (!isRepresentableStepperValue(id, value)) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.OUT_OF_RANGE, field: key }
    }
    ranges[id] = value
  }

  for (const [id, key] of Object.entries(CHECK_ID_TO_SETTING_KEY)) {
    if (typeof settings[key] === "boolean") checks[id] = settings[key]
  }

  const specifiedRoleNightActionTimes = []
  const rawRoleTimes = settings.roleNightActionTimes
  if (rawRoleTimes !== undefined && !isPlainObject(rawRoleTimes)) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: "roleNightActionTimes" }
  }
  for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
    const value = rawRoleTimes?.[role]
    if (value === undefined) {
      const effective = ranges[OVERALL_NIGHT_ACTION_TIME_ID]
      if (!isRepresentableStepperValue(id, effective)) {
        return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.OUT_OF_RANGE, field: "roleNightActionTimes" }
      }
      ranges[id] = effective
      continue
    }
    if (!isRepresentableStepperValue(id, value)) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.OUT_OF_RANGE, field: "roleNightActionTimes" }
    }
    ranges[id] = value
    specifiedRoleNightActionTimes.push(role)
  }

  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_MODE }
  }

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    return {
      ok: true,
      accessType,
      checks,
      ranges,
      roleComposition: { mode: ROLE_COMPOSITION_MODES.AUTO, roleCounts: null },
      specifiedRoleNightActionTimes,
    }
  }

  if (!isPlainObject(settings.roleCounts)) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_COUNTS }
  }
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) {
    const value = settings.roleCounts[key]
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_COUNTS }
    }
    roleCounts[key] = value
  }
  const compositionCheck = validateRoleComposition({
    mode: ROLE_COMPOSITION_MODES.CUSTOM,
    roleCounts,
    maxPlayers: settings.maxPlayers,
  })
  if (!compositionCheck.ok) {
    return {
      ok: false,
      code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_COUNTS,
      field: compositionCheck.code,
    }
  }
  if (settings.jokerCount !== roleCounts.JOKER) {
    return {
      ok: false,
      code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_COUNTS,
      field: "jokerCount",
    }
  }

  return {
    ok: true,
    accessType,
    checks,
    ranges,
    roleComposition: { mode: ROLE_COMPOSITION_MODES.CUSTOM, roleCounts },
    specifiedRoleNightActionTimes,
  }
}

export function buildUpdateRoomSettingsPayload({
  checks,
  ranges,
  roleComposition,
  specifiedRoleNightActionTimes,
  roomId,
  requestId,
  expectedSettingsVersion,
}) {
  const mode =
    roleComposition?.mode === ROLE_COMPOSITION_MODES.CUSTOM
      ? ROLE_COMPOSITION_MODES.CUSTOM
      : ROLE_COMPOSITION_MODES.AUTO

  const payload = {
    roomId,
    requestId,
    expectedSettingsVersion,
    accessType: checks?.["private-lobby"] ? "code" : "open",
    maxPlayers: ranges?.["max-players"],
    jokerCount: ranges?.["joker-count"],
    roleCompositionMode: mode,
    dayDiscussionTime: ranges?.["day-discussion-time"],
    dayVoteTime: ranges?.["day-vote-time"],
    nightActionTime: ranges?.["night-action-time"],
  }

  const roleNightActionTimes = collectSpecifiedRoleNightActionTimes(ranges, specifiedRoleNightActionTimes)
  if (roleNightActionTimes !== null) payload.roleNightActionTimes = roleNightActionTimes

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    return payload
  }

  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}

export function collectSpecifiedRoleNightActionTimes(ranges, specified) {
  const roleNightActionTimes = {}
  if (Array.isArray(specified)) {
    for (const role of specified) {
      const id = ROLE_TO_NIGHT_TIME_ID[role]
      if (id === undefined) continue
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  } else {
    for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  }
  return Object.keys(roleNightActionTimes).length > 0 ? roleNightActionTimes : null
}
