/**
 * F-24(RESTORE-24): 다음 방 복원 원본의 **허용 목록 정제**를 소유하는 순수 모듈.
 *
 * 왜 따로 있는가: 같은 정제가 두 경계에서 필요하다 — 서버 payload가 메모리 store로 들어오는
 * 경계(ingame/store/applySessionSnapshot.js)와, 그 값이 영속 매체로 오가는 경계
 * (setup/store/nextRoomSettingsStore.js)다. 두 곳이 각자 정제를 손으로 쓰면 한쪽만 고쳐졌을 때
 * 폐기된 키가 정확히 그 한쪽으로만 새어 든다. 여기에는 zustand도 React도 없다 — 저장소 모듈을
 * 스냅샷 경로가 끌어오지 않게 하려는 의도다.
 *
 * 정제 규칙은 세 겹이다.
 *   1. **최상위 허용 목록** — accessType·settingsVersion·settings 외의 키는 원본에서 버린다.
 *   2. **설정 키 허용 목록** — ALLOWED_SETTING_KEYS 밖의 키는 버린다.
 *   3. **값의 모양** — 허용된 키라도 기대하는 모양(원시값 / 역할→정수 맵)이 아니면 버린다.
 *
 * 3번이 없으면 허용된 키의 **값**에 오염을 숨길 수 있다(예: 불리언이어야 할 lightsOut 자리에
 * 폐기된 키를 담은 객체가 들어온다). 통째 spread 대신 키마다 새로 담고 모양을 확인하므로,
 * 중첩 어느 깊이에도 허용 목록 밖의 값이 남지 않는다. 반환값은 언제나 입력과 독립된 새 객체다.
 */
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../constants/gameSetupOptions.js"

/**
 * 복원 원본 settings의 최상위 허용 키.
 *
 * backend/utils/updateRoomSettingsValidation.js의 EDITABLE_ROOM_SETTING_KEYS +
 * PRESERVED_ROOM_SETTING_KEYS와 같은 값이어야 한다 — 이 경계에는 백엔드/프런트가 공유하는
 * 상수 모듈이 없어 수동으로 동기화한다(roleComposition.js와 동일한 관례).
 */
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

/** 복원 원본 레코드의 최상위 허용 키. 이 셋 말고는 어떤 이름도 남기지 않는다. */
export const ALLOWED_SOURCE_KEYS = Object.freeze(["accessType", "settingsVersion", "settings"])

/** 직업별 밤 시간의 허용 역할 키(항목 정의에서 파생 — 두 목록이 갈리지 않는다). */
const ALLOWED_ROLE_TIME_KEYS = Object.freeze(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role }) => role))

/** 중첩 허용 맵의 정의: 키는 이 목록에서만, 값은 정수만. */
const NESTED_ROLE_MAPS = Object.freeze({
  roleCounts: CUSTOM_ROLE_KEYS,
  roleNightActionTimes: ALLOWED_ROLE_TIME_KEYS,
})

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 허용된 스칼라 설정이 가질 수 있는 값의 모양. 객체·배열·함수는 전부 아니다. */
function isAllowedScalar(value) {
  return typeof value === "number" || typeof value === "boolean" || typeof value === "string"
}

/**
 * 역할→정수 맵 하나를 허용 목록으로 다시 만든다.
 * @returns {{map:object, dropped:boolean}}
 */
function sanitizeRoleMap(source, allowedRoles) {
  let dropped = false
  const map = {}
  for (const [role, value] of Object.entries(source)) {
    if (!allowedRoles.includes(role) || !Number.isInteger(value)) {
      // 허용 목록 밖의 역할이든, 허용 역할에 숨겨진 객체든 똑같이 버린다.
      dropped = true
      continue
    }
    map[role] = value
  }
  return { map, dropped }
}

/**
 * 설정 객체를 허용 목록 사본으로 만든다(RESTORE-24의 핵심 경계).
 *
 * @returns {{settings:object, dropped:boolean}} dropped는 버려진 것이 있었는지(오염 신호)다.
 */
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
    // 허용된 키라도 값이 객체·배열이면 그 안에 무엇이 들었는지 이 경계가 알 수 없다 —
    // 모양이 다르면 버린다(오염을 값 안에 숨기는 경로를 닫는다).
    if (!isAllowedScalar(value)) {
      dropped = true
      continue
    }
    view[key] = value
  }

  return { settings: view, dropped }
}

/**
 * 복원 원본 하나를 정제한다. accessType·settingsVersion·settings 세 값만 남긴다(A-02) —
 * roomId·gameId·code·명단·membership·준비·배정 역할·결과는 어느 경계에서도 만들지 않는다.
 *
 * @returns {{ok:true, source:object, dropped:boolean}|{ok:false}}
 */
export function sanitizeRestoreSource(source) {
  if (!isPlainObject(source)) return { ok: false }
  const { accessType, settingsVersion } = source
  if (accessType !== "open" && accessType !== "code") return { ok: false }
  if (!isPlainObject(source.settings)) return { ok: false }

  const { settings, dropped } = sanitizeRoomSettings(source.settings)
  // 폼이 반드시 필요로 하는 다섯 스테퍼가 하나라도 없으면 복원 원본으로 쓸 수 없다. 여기서
  // 기본값으로 메우면 "복원했다"는 말이 거짓이 된다(A-01/A-11).
  for (const key of ["maxPlayers", "jokerCount", "dayDiscussionTime", "dayVoteTime", "nightActionTime"]) {
    if (!Number.isInteger(settings[key])) return { ok: false }
  }
  const mode = settings.roleCompositionMode ?? ROLE_COMPOSITION_MODES.AUTO
  if (mode !== ROLE_COMPOSITION_MODES.AUTO && mode !== ROLE_COMPOSITION_MODES.CUSTOM) return { ok: false }

  // 버려진 것이 있었다는 사실은 위로 전달한다 — 호출부가 정제본을 다시 저장해야 하는 신호다.
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
