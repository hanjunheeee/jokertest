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
// 역할 구성의 성립 조건은 이 화면이 다시 정의하지 않는다 — 폼·버튼·서버 요청이 모두
// 참조하는 그 한 규칙을 그대로 쓴다(사본을 만들면 편집 시작점만 다른 기준을 갖게 된다).
import { validateRoleComposition } from "./roleComposition.js"

/**
 * 전체 밤 제한시간 스테퍼의 id.
 *
 * 지정하지 않은 직업의 **실효값**이 곧 이 값이라, 초기 변환(아래 폴백)과 편집 중 따라가기
 * (GameSetupPanel.handleSetRange)가 같은 항목을 가리켜야 한다 — 두 곳이 문자열을 따로 적으면
 * 한쪽만 바뀌어도 화면과 서버가 서로 다른 밤 시간을 말하게 된다.
 */
export const OVERALL_NIGHT_ACTION_TIME_ID = "night-action-time"

/** 폼 상태 id ↔ 서버 설정 필드의 유일한 대응표(스테퍼). */
const RANGE_ID_TO_SETTING_KEY = Object.freeze({
  "max-players": "maxPlayers",
  "joker-count": "jokerCount",
  "day-discussion-time": "dayDiscussionTime",
  "day-vote-time": "dayVoteTime",
  [OVERALL_NIGHT_ACTION_TIME_ID]: "nightActionTime",
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

/**
 * 직업별 밤 시간 스테퍼 id → 역할 키(위 대응표의 역방향).
 *
 * 폼은 "어느 스테퍼를 건드렸는가"를 id로 안다. 그 사실을 서버 계약의 역할 키로 옮기려면
 * 역방향 대응이 필요하고, 그 대응도 같은 정의 한 곳에서만 파생돼야 한다.
 */
export const NIGHT_TIME_ID_TO_ROLE = Object.freeze(
  Object.fromEntries(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role, id }) => [id, role])),
)

/**
 * 저장 요청에 실을 "지정한 직업" 목록을 만듭니다.
 *
 * 두 사실을 합친다:
 *   - serverSpecified: 서버에 **이미** 지정돼 있던 직업. 편집을 열고 아무것도 바꾸지 않은
 *     채 저장해도 없던 override가 생기지 않게 하는 근거다.
 *   - editedRoleTimeIds: 이번 편집에서 방장이 **실제로 값을 바꾼** 스테퍼. 이것이 없으면
 *     원래 지정돼 있지 않던 직업의 시간을 바꿔도 그 변경이 요청에 실리지 않아, 화면에서는
 *     바뀐 값이 보이는데 서버에는 영영 전달되지 않는다.
 *
 * serverSpecified가 배열이 아니면(= 생성 화면처럼 "지정 목록"이라는 개념이 없는 출발점)
 * undefined를 돌려준다 — 그러면 기존 생성 계약대로 스테퍼 전부가 실린다.
 *
 * @param {string[]|undefined} serverSpecified
 * @param {Set<string>|undefined} editedRoleTimeIds - 값이 실제로 바뀐 스테퍼 id 집합
 * @returns {string[]|undefined}
 */
export function mergeSpecifiedRoleNightActionTimes(serverSpecified, editedRoleTimeIds) {
  if (!Array.isArray(serverSpecified)) return undefined
  // 정의 순서대로 만들어 같은 입력이 언제나 같은 목록이 되게 한다(요청 지문의 안정성).
  return ROLE_NIGHT_ACTION_TIME_OPTIONS
    .filter(({ role, id }) => serverSpecified.includes(role) || editedRoleTimeIds?.has?.(id) === true)
    .map(({ role }) => role)
}

export const ROOM_SETTINGS_FORM_ERROR_CODES = Object.freeze({
  NOT_OBJECT: "NOT_OBJECT",
  INVALID_ACCESS_TYPE: "INVALID_ACCESS_TYPE",
  MISSING_FIELD: "MISSING_FIELD",
  // 값은 있으나 이 화면의 스테퍼가 **표현할 수 없는** 값이다(범위 밖·step에 맞지 않음).
  // MISSING_FIELD와 구분한다 — "서버가 안 줬다"와 "줬는데 우리가 못 그린다"는 다른 사실이고,
  // 뒤쪽을 기본값으로 덮으면 방장이 건드리지도 않은 값을 저장하게 된다.
  OUT_OF_RANGE: "OUT_OF_RANGE",
  INVALID_ROLE_COUNTS: "INVALID_ROLE_COUNTS",
  INVALID_ROLE_MODE: "INVALID_ROLE_MODE",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** id → 스테퍼 정의(min·max·step). 항목 정의가 곧 이 화면이 표현할 수 있는 값의 계약이다. */
const STEPPER_ITEMS_BY_ID = Object.freeze(Object.fromEntries(
  [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]
    .filter((item) => item.type === "stepper")
    .map((item) => [item.id, item]),
))

/**
 * 이 스테퍼가 정말로 그 값을 가리킬 수 있는가.
 *
 * 정수 여부만 보면 "정원 7"이나 "토론 75초"처럼 화면에 보이기는 하지만 어느 클릭으로도
 * 도달할 수 없고 서버 허용 목록에도 없는 값이 편집 시작점이 된다. min·max·step은 이미
 * 화면·서버가 공유하는 계약이므로(gameSetupOptions.js 주석 참고) 그 계약으로 판정한다.
 */
function isRepresentableStepperValue(id, value) {
  const item = STEPPER_ITEMS_BY_ID[id]
  if (!item) return false
  if (!Number.isInteger(value)) return false
  if (value < item.min || value > item.max) return false
  const step = Number.isInteger(item.step) && item.step > 0 ? item.step : 1
  return (value - item.min) % step === 0
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
    if (value === undefined) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: key }
    }
    if (!isRepresentableStepperValue(id, value)) {
      return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.OUT_OF_RANGE, field: key }
    }
    ranges[id] = value
  }

  // D-12의 세 값은 편집 대상이 아니지만, 서버가 보존하는 현재 값을 폼 상태에는 담아 둔다 —
  // 생성 화면이 같은 변환기를 쓰기 때문이다. 편집 화면은 이 항목을 그리지 않는다.
  for (const [id, key] of Object.entries(CHECK_ID_TO_SETTING_KEY)) {
    if (typeof settings[key] === "boolean") checks[id] = settings[key]
  }

  // 직업별 밤 시간.
  //
  // 지정한 역할은 그 값을 그대로 보여주고 "지정했다"는 사실을 보존한다. 지정하지 **않은**
  // 역할은 서버에서 전체 밤 시간으로 폴백하므로, 화면도 그 **실제로 적용될 값**을 보여준다 —
  // 생성 기본값(90)을 보여주면 전체 밤 시간이 60인 방에서 방장은 "이 직업은 90초"라고 읽는데
  // 서버는 60초를 쓴다. 그러면서도 지정 목록에는 넣지 않으므로, 열고 그대로 저장하는 것만으로
  // 없던 override가 생기지는 않는다(두 성질은 서로 독립이다).
  const specifiedRoleNightActionTimes = []
  const rawRoleTimes = settings.roleNightActionTimes
  if (rawRoleTimes !== undefined && !isPlainObject(rawRoleTimes)) {
    return { ok: false, code: ROOM_SETTINGS_FORM_ERROR_CODES.MISSING_FIELD, field: "roleNightActionTimes" }
  }
  for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
    const value = rawRoleTimes?.[role]
    if (value === undefined) {
      // 폴백 대상은 방금 검사를 통과한 전체 밤 시간이다. 그 값이 이 스테퍼의 계약 안에 있는지는
      // 다시 확인한다 — 두 항목의 범위가 어긋나면 조용히 넘기지 않고 실패로 본다.
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
  // 역할 상한·합계·광대 하한은 폼과 제출 버튼이 이미 쓰는 그 규칙으로 판정한다. 여기서
  // 통과시키면 "편집 화면은 열리는데 저장 버튼은 영원히 비활성"인 시작점이 만들어진다.
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
  // CUSTOM에서 canonical한 광대 수는 roleCounts.JOKER다(서버도 두 값이 다르면 거부한다).
  // 어긋난 채로 폼을 열면 두 스테퍼가 서로 다른 값을 보여준다.
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
