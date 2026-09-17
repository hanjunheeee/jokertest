/**
 * 서버가 확정한 방 설정 ↔ 설정 화면(checks/ranges/역할 구성) 폼 상태의 공용 변환기.
 *
 * 왜 따로 두는가: 지금까지 폼은 "생성 기본값에서 시작한다"는 한 가지 출발점만 알고 있었다.
 * F-20에서는 **이미 존재하는 방의 서버 확정 설정**에서 시작하는 두 번째 출발점이 생기고,
 * F-24는 "다음 방 설정 복원"이라는 세 번째 출발점을 추가한다. 세 곳이 각자 변환하면
 * "어떤 키가 어떤 스테퍼인가"가 조용히 갈린다 — 그 대응을 여기 한 곳에만 둔다.
 *
 * React/Socket/Zustand에 의존하지 않는 순수 함수라 JSX 없이 node:test로 검증된다.
 *
 * 설계 원칙
 * - **보정하지 않는다.** 서버 설정이 폼이 표현할 수 없는 값이면 기본값으로 덮어 "성공할 것
 *   같은" 폼을 만들지 않고 실패를 돌려준다. 덮으면 방장이 보는 값과 서버 값이 갈린다.
 * - 관전자 키를 포함한 **허용 목록 밖 키는 만들지 않는다**(AC-06). 입력에 섞여 있어도
 *   checks/ranges/roleCounts 어디에도 옮기지 않는다.
 * - 직업별 밤 시간은 "지정했는지" 자체를 상태로 보존한다. 지정하지 않은 직업을 폼이 임의로
 *   채우면, 편집을 열고 그대로 저장하는 것만으로 없던 override가 생긴다.
 */
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import {
  GENERAL_GAME_SETUP,
  MEETING_GAME_SETUP,
  ROLE_NIGHT_ACTION_TIME_OPTIONS,
} from "../constants/gameSetupOptions.js"

/** 폼 상태 id ↔ 서버 설정 필드의 유일한 대응표(스테퍼). */
const RANGE_ID_TO_SETTING_KEY = Object.freeze({
  "max-players": "maxPlayers",
  "joker-count": "jokerCount",
  "day-discussion-time": "dayDiscussionTime",
  "day-vote-time": "dayVoteTime",
  "night-action-time": "nightActionTime",
})

/** 폼 상태 id ↔ 서버 설정 필드의 유일한 대응표(체크박스). */
const CHECK_ID_TO_SETTING_KEY = Object.freeze({
  "lights-out": "lightsOut",
  "soul-betting": "soulBetting",
  "vote-reveal": "voteReveal",
})

/** F-20 편집 화면에서 제외하는 항목 id — D-12의 추가 규칙 세 가지다(A-06). */
export const NON_EDITABLE_SETUP_ITEM_IDS = Object.freeze(["lights-out", "soul-betting", "vote-reveal"])

const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

/** 역할 id → 직업별 밤 시간 스테퍼 id */
const ROLE_TO_NIGHT_TIME_ID = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [role, id])),
)

export const ROOM_SETTINGS_FORM_ERROR_CODES = Object.freeze({
  NOT_OBJECT: "NOT_OBJECT",
  INVALID_ACCESS_TYPE: "INVALID_ACCESS_TYPE",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_ROLE_COUNTS: "INVALID_ROLE_COUNTS",
  INVALID_ROLE_MODE: "INVALID_ROLE_MODE",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** items 정의에서 생성 기본값 폼 상태를 만든다(기존 useSetupTabState.buildInitialState와 같은 규칙). */
export function buildDefaultSetupFormState(items = ALL_SETUP_ITEMS) {
  const checks = {}
  const ranges = {}
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

/**
 * 서버가 확정한 설정을 폼 상태로 변환합니다.
 *
 * @param {{accessType?:string, settings?:object}} source - get_current_room/room_settings_updated의
 *   방 응답 조각. 신뢰하지 않는다(서버가 준 값이라도 형태는 다시 확인한다).
 * @returns {{ok:true, checks:object, ranges:object, roleComposition:{mode:string,roleCounts:object},
 *            specifiedRoleNightActionTimes:string[]}
 *          |{ok:false, code:string}}
 */
export function buildRoomSettingsFormState(source) {
  if (!isPlainObject(source) || !isPlainObject(source.settings)) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.NOT_OBJECT }
  }
  const { accessType, settings } = source

  if (accessType !== "open" && accessType !== "code") {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ACCESS_TYPE }
  }

  // 기본값에서 시작하되, 서버가 값을 가진 필드는 **반드시** 서버 값으로 덮는다. 서버가
  // 값을 주지 않은 편집 대상 필드는 조용히 기본값으로 두지 않고 실패로 본다 — 그 상태로
  // 저장하면 방장이 건드리지도 않은 값을 바꾸게 된다.
  const { checks, ranges } = buildDefaultSetupFormState()

  // "코드로만 참가" 체크박스는 서버의 accessType에서 파생된다(반대 방향은
  // buildUpdateRoomSettingsPayload/buildCreateRoomPayload가 담당).
  checks["private-lobby"] = accessType === "code"

  for (const [id, key] of Object.entries(RANGE_ID_TO_SETTING_KEY)) {
    const value = settings[key]
    if (!Number.isInteger(value)) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: key }
    }
    ranges[id] = value
  }

  // D-12의 세 값은 편집 대상이 아니지만, 서버가 보존하는 현재 값을 폼 상태에는 담아 둔다 —
  // 생성 화면이 같은 변환기를 쓰기 때문이다. 편집 화면은 이 항목을 그리지 않는다.
  for (const [id, key] of Object.entries(CHECK_ID_TO_SETTING_KEY)) {
    if (typeof settings[key] === "boolean") checks[id] = settings[key]
  }

  // 직업별 밤 시간: 서버가 준 역할만 스테퍼 값을 덮고, 그 역할 목록을 그대로 보존한다.
  // 지정하지 않은 역할의 스테퍼는 기본값으로 **보이기만** 하고 저장 대상이 아니다.
  const specifiedRoleNightActionTimes = []
  const rawRoleTimes = settings.roleNightActionTimes
  if (rawRoleTimes !== undefined) {
    if (!isPlainObject(rawRoleTimes)) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: "roleNightActionTimes" }
    }
    for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
      const value = rawRoleTimes[role]
      if (value === undefined) continue
      if (!Number.isInteger(value)) {
        return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: "roleNightActionTimes" }
      }
      ranges[id] = value
      specifiedRoleNightActionTimes.push(role)
    }
  }

  // 역할 구성. 값이 없는 구버전 설정은 서버와 같은 규칙으로 AUTO로 본다.
  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_MODE }
  }

  if (mode === ROLE_COMPOSITION_MODES.AUTO) {
    // AUTO에서는 roleCounts를 상태로 만들지 않는다 — CUSTOM으로 전환할 때 훅이 기본값에서
    // 시작한다(생성 화면과 같은 동작).
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
  // 허용된 4개 키만 새 객체로 옮긴다 — 다른 키(CITIZEN·관전자 등)는 상태로 만들지 않는다.
  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) {
    const value = settings.roleCounts[key]
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.INVALID_ROLE_COUNTS }
    }
    roleCounts[key] = value
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

/**
 * 폼 상태를 update_room_settings 요청 payload로 변환합니다.
 *
 * buildCreateRoomPayload와 달리 **편집 가능한 필드만** 싣는다 — lightsOut·soulBetting·
 * voteReveal은 서버가 보존하므로 보내지 않고, roomId·requestId·expectedSettingsVersion은
 * "어느 방의 어느 버전을 바꾸려는 요청인가"를 말하기 위해 반드시 함께 싣는다.
 *
 * @param {{checks:object, ranges:object,
 *          roleComposition?:{mode:string, roleCounts:object},
 *          specifiedRoleNightActionTimes?:string[],
 *          roomId:string, requestId:string, expectedSettingsVersion:number}} input
 */
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
    // AUTO에서는 roleCounts를 만들지 않는다 — CUSTOM에서 되돌아온 경우에도 이전 입력이
    // 요청에 남지 않는다(서버도 AUTO+roleCounts를 거부한다).
    return payload
  }

  const roleCounts = {}
  for (const key of CUSTOM_ROLE_KEYS) roleCounts[key] = roleComposition.roleCounts?.[key]

  return {
    ...payload,
    // CUSTOM에서는 roleCounts.JOKER가 canonical이다(서버가 두 값이 다르면 거부한다).
    jokerCount: roleCounts.JOKER,
    roleCounts,
  }
}

/**
 * "지정한 역할"의 밤 시간만 모읍니다.
 *
 * specified가 배열이면 그 역할만 싣는다 — 편집을 열고 아무것도 바꾸지 않은 채 저장하는
 * 것만으로 서버에 없던 override가 생기지 않게 하기 위함이다. specified를 아예 주지 않으면
 * (생성 화면 등) 기존 계약대로 ranges에 있는 스테퍼 전부를 싣는다.
 *
 * @returns {object|null} null이면 payload에 필드 자체를 만들지 않는다(전 직업 폴백).
 */
export function collectSpecifiedRoleNightActionTimes(ranges, specified) {
  const roleNightActionTimes = {}
  if (Array.isArray(specified)) {
    for (const role of specified) {
      const id = ROLE_TO_NIGHT_TIME_ID[role]
      if (id === undefined) continue // 알 수 없는 역할은 만들지 않는다(서버도 거부한다)
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  } else {
    for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  }
  // 하나도 없으면 필드 자체를 만들지 않는다 — 빈 객체를 보내면 "전 직업 폴백"과 "지정했지만
  // 아무 직업도 고르지 않음"이 서버 입장에서 구별되지 않는다.
  return Object.keys(roleNightActionTimes).length > 0 ? roleNightActionTimes : null
}
