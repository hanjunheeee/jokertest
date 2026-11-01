// 서버 방 설정 → 설정 폼 첫 값 (못 나타내는 값이면 오류 코드)
// utils/resolveRestore·matching/hooks/useSettingsEdit·hooks/useSetupTabState가 씀
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../../constants/roleComposition.js"
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../../constants/gameSetupOptions.js"
import {
  ALL_SETUP_ITEMS,
  CHECK_ID_TO_SETTING_KEY,
  OVERALL_NIGHT_ACTION_TIME_ID,
  RANGE_ID_TO_SETTING_KEY,
  ERROR_CODES as ERR,
  STEPPER_ITEMS_BY_ID,
} from "../../constants/roomSettingsForm.js"
import { validateRoleComposition } from "../roleComposition.js"
import { isPlainObject } from "../../../shared/utils/valueChecks.js"

// 숫자 고르기 칸이 그 값을 보여 줄 수 있는지 (정수·범위 안·간격에 맞음)
function fitsStepper(id, value) {
  const item = STEPPER_ITEMS_BY_ID[id]
  if (!item) return false
  if (!Number.isInteger(value)) return false
  if (value < item.min || value > item.max) return false
  const step = Number.isInteger(item.step) && item.step > 0 ? item.step : 1
  return (value - item.min) % step === 0
}

// 항목 정의의 기본값으로 폼 채우기
export function buildDefaultFormState(items = ALL_SETUP_ITEMS) {
  const checks = {}
  const ranges = {}
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

// source = { accessType, settings }, 결과 = { ok, accessType, checks, ranges, roleComposition, specifiedRoleNightActionTimes }
export function buildRoomSettingsFormState(source) {
  // 모양·공개 방식 확인
  if (!isPlainObject(source) || !isPlainObject(source.settings)) {
    return { ok: false, code: ERR.NOT_OBJECT }
  }
  const { accessType, settings } = source

  if (accessType !== "open" && accessType !== "code") {
    return { ok: false, code: ERR.INVALID_ACCESS_TYPE }
  }

  const { checks, ranges } = buildDefaultFormState()

  checks["private-lobby"] = accessType === "code"

  // 숫자 항목은 꼭 있어야 하고 칸이 보여 줄 수 있는 값이어야 함
  for (const [id, key] of Object.entries(RANGE_ID_TO_SETTING_KEY)) {
    const value = settings[key]
    if (value === undefined) {
      return { ok: false, code: ERR.MISSING_FIELD, field: key }
    }
    if (!fitsStepper(id, value)) {
      return { ok: false, code: ERR.OUT_OF_RANGE, field: key }
    }
    ranges[id] = value
  }

  // 체크 항목은 있을 때만 덮음
  for (const [id, key] of Object.entries(CHECK_ID_TO_SETTING_KEY)) {
    if (typeof settings[key] === "boolean") checks[id] = settings[key]
  }

  // 직업별 밤 시간: 없는 직업은 전체 밤 시간을 씀, 서버가 따로 정한 직업은 기억
  const specifiedRoleNightActionTimes = []
  const rawRoleTimes = settings.roleNightActionTimes
  if (rawRoleTimes !== undefined && !isPlainObject(rawRoleTimes)) {
    return { ok: false, code: ERR.MISSING_FIELD, field: "roleNightActionTimes" }
  }
  for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
    const value = rawRoleTimes?.[role]
    if (value === undefined) {
      const effective = ranges[OVERALL_NIGHT_ACTION_TIME_ID]
      if (!fitsStepper(id, effective)) {
        return { ok: false, code: ERR.OUT_OF_RANGE, field: "roleNightActionTimes" }
      }
      ranges[id] = effective
      continue
    }
    if (!fitsStepper(id, value)) {
      return { ok: false, code: ERR.OUT_OF_RANGE, field: "roleNightActionTimes" }
    }
    ranges[id] = value
    specifiedRoleNightActionTimes.push(role)
  }

  // 직업 구성 방식
  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) {
    return { ok: false, code: ERR.INVALID_ROLE_MODE }
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

  // 직접 지정: 직업 수가 모두 0 이상 정수, 구성 규칙 통과, 조커 수가 맞아야 함
  if (!isPlainObject(settings.roleCounts)) {
    return { ok: false, code: ERR.INVALID_ROLE_COUNTS }
  }
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) {
    const value = settings.roleCounts[key]
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, code: ERR.INVALID_ROLE_COUNTS }
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
      code: ERR.INVALID_ROLE_COUNTS,
      field: compositionCheck.code,
    }
  }
  if (settings.jokerCount !== roleCounts.JOKER) {
    return {
      ok: false,
      code: ERR.INVALID_ROLE_COUNTS,
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
