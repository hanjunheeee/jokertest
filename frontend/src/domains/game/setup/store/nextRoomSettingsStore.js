/**
 * F-24(AC-04/AC-05/RESTORE-24): "다음 게임 동일 설정 유지"의 **계정별 영속 저장소**.
 *
 * 무엇을 소유하는가
 * - 유지 선택이 켜졌을 때 저장할 복원 원본의 **정제**(허용 목록 사본).
 * - 그 원본의 영속 쓰기·재읽기 확인·삭제·비활성 표시, 그리고 각 단계의 실패 상태.
 * - 다음 방 생성 화면이 읽어 갈 **현재 계정의** 복원 원본.
 *
 * 무엇을 소유하지 않는가
 * - "지금 유지를 켜도 되는가"(인증·참가 소속·서버 원본 도착 여부)는 인게임 훅이 판단한다.
 * - 폼 변환(buildRoomSettingsFormState)은 생성 화면 훅이 한다. 여기서는 서버 계약 모양의
 *   원본만 다룬다 — 두 책임을 합치면 저장 매체에 화면 표현이 섞인다.
 *
 * 저장 범위(A-08)
 * - 같은 origin·같은 브라우저 프로필의 **인증 계정별 localStorage** 하나뿐이다. 다른 브라우저·
 *   다른 프로필과 동기화하지 않고, 서버 API도 DB 테이블도 새로 만들지 않는다. 화면은 이
 *   범위를 사용자에게 그대로 알린다(useNextRoomSettings의 scopeNotice).
 * - auth-storage는 쓰지 않는다. 그 키는 인증 store의 것이고, 다른 기능의 저장소를 이 기능이
 *   읽거나 지우지 않는다.
 *
 * 정제(RESTORE-24)
 * - 저장 전에도, 읽은 뒤에도 **허용 목록으로 새 객체를 만든다**. source를 통째로 spread하지
 *   않으므로 허용 목록 밖의 어떤 키도 — 최상위든 roleCounts·roleNightActionTimes 안이든,
 *   이름이 무엇이든 — 어느 경계도 통과하지 못한다.
 * - 읽을 때 오염이 발견되면 정제본을 **다시 저장한다**. 재저장이 실패하면 그 사실을 실패로
 *   표시하고 "정상 복원 완료"라고 말하지 않는다(A-11).
 *
 * 계정 격리
 * - 키에 계정 uuid가 들어가고, 레코드 안에도 accountId가 들어간다. 둘이 다르면 복원하지
 *   않는다 — 키만 믿으면 손으로 옮겨 붙인 레코드가 남의 값을 그대로 복원한다.
 */
import { create } from "zustand"
import { CUSTOM_ROLE_KEYS, ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../constants/gameSetupOptions.js"

/** 저장 스키마 버전. 모양이 바뀌면 올리고, 다른 버전의 레코드는 복원하지 않는다. */
export const NEXT_ROOM_SETTINGS_SCHEMA_VERSION = 1

/** 키 접두사. 계정 uuid는 encodeURIComponent로 감싸 구분자 충돌을 막는다. */
const KEY_PREFIX = "joker:next-room-settings:v1:"

/**
 * 복원 원본 settings의 최상위 허용 키.
 *
 * backend/utils/updateRoomSettingsValidation.js의 EDITABLE_ROOM_SETTING_KEYS +
 * PRESERVED_ROOM_SETTING_KEYS와 같은 값이어야 한다 — 이 저장소에는 백엔드/프런트가 공유하는
 * 상수 모듈이 없어 수동으로 동기화한다(roleComposition.js와 동일한 관례).
 */
const ALLOWED_SETTING_KEYS = Object.freeze([
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

/** 직업별 밤 시간의 허용 역할 키(항목 정의에서 파생 — 두 목록이 갈리지 않는다). */
const ALLOWED_ROLE_TIME_KEYS = Object.freeze(ROLE_NIGHT_ACTION_TIME_OPTIONS.map(({ role }) => role))

/** 영속 계층의 상태 코드. 화면·시험이 분기에 쓰는 안정적 식별자다. */
export const NEXT_ROOM_SETTINGS_STATUS = Object.freeze({
  IDLE: "IDLE",
  /** 쓰기·삭제가 진행 중(동기 매체지만 상태 전이는 명시한다). */
  PENDING: "PENDING",
  /** 쓰기 후 재읽기까지 확인됐다. */
  SAVED: "SAVED",
  /** 삭제(또는 비활성 표시)가 확인됐다 — 다음 방은 기본값으로 시작한다. */
  CLEARED: "CLEARED",
  /** 영속 쓰기가 실패했다. 화면은 재시도를 제공해야 한다. */
  SAVE_FAILED: "SAVE_FAILED",
  /** 삭제도 비활성 쓰기도 실패했다. 새로고침하면 이전 값이 다시 보일 수 있다. */
  CLEAR_FAILED: "CLEAR_FAILED",
})

/** 복원 결과 코드. "왜 복원하지 못했는가"를 기본값 적용과 구분해 알린다. */
export const NEXT_ROOM_SETTINGS_RESTORE_CODES = Object.freeze({
  /** 저장된 원본이 없다(정상 — 기본값으로 시작한다). */
  NONE: "NONE",
  /** 유지가 꺼져 있다(정상 — 기본값으로 시작한다). */
  DISABLED: "DISABLED",
  /** 정상 복원. */
  RESTORED: "RESTORED",
  /** 레코드가 깨졌다(JSON 손상·스키마 불일치·필수값 누락·계정 불일치). */
  CORRUPTED: "CORRUPTED",
  /** 정제는 했지만 그 정제본을 다시 저장하지 못했다 — 복원값은 쓰되 실패를 알린다. */
  SANITIZE_WRITE_FAILED: "SANITIZE_WRITE_FAILED",
  /** 저장 매체 자체를 읽을 수 없다(사생활 모드·차단 등). */
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

/** 이 계정의 저장 키. 계정이 없으면 키도 없다(전역 키를 만들지 않는다). */
export function nextRoomSettingsStorageKey(accountId) {
  if (!isNonEmptyString(accountId)) return null
  return `${KEY_PREFIX}${encodeURIComponent(accountId)}`
}

/**
 * localStorage 핸들. 없거나 접근이 막힌 환경(사생활 모드·비보안 컨텍스트)에서는 null이다 —
 * 그때는 "저장한 척"하지 않고 실패로 표시한다.
 */
function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * 설정 객체를 허용 목록 사본으로 만든다(RESTORE-24의 핵심 경계).
 *
 * 최상위·roleCounts·roleNightActionTimes를 **각각** 허용 목록으로 새로 만든다. 통째 spread를
 * 쓰지 않으므로 어떤 이름의 폐기된 키도 통과하지 못하고, 반환값은 입력과 독립된 객체라
 * 이후 어느 쪽을 변형해도 다른 쪽이 오염되지 않는다.
 *
 * @returns {{settings:object, dropped:boolean}} dropped는 버려진 키가 있었는지(오염 신호)다.
 */
export function sanitizeRoomSettings(settings) {
  const source = isPlainObject(settings) ? settings : {}
  let dropped = false
  const view = {}

  for (const key of Object.keys(source)) {
    if (!ALLOWED_SETTING_KEYS.includes(key)) dropped = true
  }

  for (const key of ALLOWED_SETTING_KEYS) {
    if (key === "roleCounts" || key === "roleNightActionTimes") continue
    if (source[key] !== undefined) view[key] = source[key]
  }

  if (isPlainObject(source.roleCounts)) {
    const roleCounts = {}
    for (const role of Object.keys(source.roleCounts)) {
      if (!CUSTOM_ROLE_KEYS.includes(role)) dropped = true
    }
    for (const role of CUSTOM_ROLE_KEYS) {
      if (source.roleCounts[role] !== undefined) roleCounts[role] = source.roleCounts[role]
    }
    view.roleCounts = roleCounts
  }

  if (isPlainObject(source.roleNightActionTimes)) {
    const roleNightActionTimes = {}
    for (const role of Object.keys(source.roleNightActionTimes)) {
      if (!ALLOWED_ROLE_TIME_KEYS.includes(role)) dropped = true
    }
    for (const role of ALLOWED_ROLE_TIME_KEYS) {
      if (source.roleNightActionTimes[role] !== undefined) {
        roleNightActionTimes[role] = source.roleNightActionTimes[role]
      }
    }
    view.roleNightActionTimes = roleNightActionTimes
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

  // 버려진 키가 있었다는 사실은 위로 전달한다 — 호출부가 정제본을 다시 저장해야 하는 신호다.
  const topLevelDropped = Object.keys(source).some(
    (key) => key !== "accessType" && key !== "settingsVersion" && key !== "settings",
  )

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

/** 저장할 레코드 한 벌을 만든다(정제된 원본만 들어간다). */
function buildRecord(accountId, source) {
  return {
    schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION,
    accountId,
    enabled: true,
    source,
  }
}

/** 삭제가 실패했을 때 남기는 "꺼짐" 표식. source는 절대 남기지 않는다. */
function buildDisabledRecord(accountId) {
  return { schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION, accountId, enabled: false }
}

/**
 * 원시 저장 문자열을 레코드로 해석한다(신뢰하지 않는 입력).
 *
 * @returns {{kind:'none'}|{kind:'corrupted'}|{kind:'disabled'}|{kind:'enabled', source:object, dropped:boolean}}
 */
function parseRecord(raw, accountId) {
  if (raw === null || raw === undefined) return { kind: "none" }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: "corrupted" }
  }
  if (!isPlainObject(parsed)) return { kind: "corrupted" }
  if (parsed.schemaVersion !== NEXT_ROOM_SETTINGS_SCHEMA_VERSION) return { kind: "corrupted" }
  // 키의 계정과 레코드의 계정이 다르면 복원하지 않는다 — 계정 간 값 혼입의 마지막 방어다.
  if (parsed.accountId !== accountId) return { kind: "corrupted" }
  if (parsed.enabled !== true) return { kind: "disabled" }

  const sanitized = sanitizeRestoreSource(parsed.source)
  if (!sanitized.ok) return { kind: "corrupted" }
  return { kind: "enabled", source: sanitized.source, dropped: sanitized.dropped }
}

/** 실제 쓰기 + 재읽기 확인. 확인 전에는 성공이라고 말하지 않는다(A-11). */
function writeRecordVerified(key, record) {
  const storage = getStorage()
  if (storage === null) return false
  try {
    storage.setItem(key, JSON.stringify(record))
  } catch {
    return false
  }
  try {
    return storage.getItem(key) === JSON.stringify(record)
  } catch {
    return false
  }
}

/** 실제 삭제 + 부재 확인. */
function removeRecordVerified(key) {
  const storage = getStorage()
  if (storage === null) return false
  try {
    storage.removeItem(key)
  } catch {
    return false
  }
  try {
    return storage.getItem(key) === null
  } catch {
    return false
  }
}

const INITIAL_STATE = Object.freeze({
  /** 이 store가 지금 다루고 있는 계정. 다른 계정으로 바뀌면 메모리 상태를 전부 버린다. */
  accountId: null,
  /**
   * 유지 선택의 세대. 해제가 먼저 올리고, 늦게 도착한 생산자 쓰기는 자기 세대가 현재일 때만
   * 반영된다 — 그러지 않으면 방금 끈 설정을 옛 스냅샷이 다시 저장한다(A-05).
   */
  selectionGeneration: 0,
  /** 화면이 보여줄 체크 상태(영속 확인까지 끝난 사실만 true가 된다). */
  enabled: false,
  status: NEXT_ROOM_SETTINGS_STATUS.IDLE,
  /** 마지막 실패에서 재시도할 때 쓰는 대상(계정·원본). 성공하면 비운다. */
  pendingRetry: null,
})

export const useNextRoomSettingsStore = create((set, get) => ({
  ...INITIAL_STATE,

  /**
   * 현재 인증 계정을 알린다. 계정이 실제로 바뀌면 메모리 상태(체크·상태·재시도)를 전부 버린다.
   * **다른 계정의 영속 키는 건드리지 않는다** — 로그아웃은 그 계정의 저장값을 지우는 명령이
   * 아니다(RESTORE-24).
   */
  setAccount: (accountId) => {
    const next = isNonEmptyString(accountId) ? accountId : null
    if (get().accountId === next) return
    set((current) => ({
      ...INITIAL_STATE,
      accountId: next,
      // 세대는 단조다 — 되돌리면 계정 전환 전에 날아간 쓰기가 다시 현재처럼 보인다.
      selectionGeneration: current.selectionGeneration + 1,
    }))
  },

  /**
   * 유지를 켠다. 정제 → 쓰기 → 재읽기 확인까지 마쳐야 enabled=true가 된다.
   *
   * @param {{accountId:string, source:object}} input 서버가 확정한 복원 원본(신뢰하지 않는다).
   * @returns {{ok:boolean, status:string}}
   */
  keepSettings: ({ accountId, source } = {}) => {
    const current = get()
    // 저장 요청이 만들어진 계정과 지금 계정이 다르면 아무것도 하지 않는다.
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
    const sanitized = sanitizeRestoreSource(source)
    if (key === null || !sanitized.ok) {
      set({ status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED, enabled: false, pendingRetry: null })
      return { ok: false, status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED }
    }

    // 이 쓰기가 속한 세대. 쓰기 자체는 동기지만, 세대를 함께 기록해 두면 이후 해제가 이
    // 결과를 되돌릴 때 "누가 더 새로운 의도인가"를 값이 아니라 세대로 판정할 수 있다.
    const generation = current.selectionGeneration
    const record = buildRecord(accountId, sanitized.source)
    const ok = writeRecordVerified(key, record)

    // 쓰기 도중 계정이나 선택 세대가 바뀌었으면 이 결과는 현재 화면의 사실이 아니다.
    const after = get()
    if (after.accountId !== accountId || after.selectionGeneration !== generation) {
      return { ok: false, status: after.status }
    }

    if (!ok) {
      set({
        status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED,
        enabled: false,
        pendingRetry: { kind: "keep", accountId, source: sanitized.source, generation },
      })
      return { ok: false, status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED }
    }
    set({ status: NEXT_ROOM_SETTINGS_STATUS.SAVED, enabled: true, pendingRetry: null })
    return { ok: true, status: NEXT_ROOM_SETTINGS_STATUS.SAVED }
  },

  /**
   * 유지를 끈다(AC-05).
   *
   * 순서가 중요하다. **세대를 먼저 올려** 늦은 생산자 쓰기를 차단하고, 그 다음에 메모리
   * 원본을 비우고, 마지막으로 영속 삭제를 시도한다. 삭제가 실패하면 같은 키에 비활성
   * 레코드를 써서 "복원하지 않는다"는 사실만이라도 남기고, 그것마저 실패하면 실패로
   * 표시한다 — 현재 화면은 기본값을 쓰지만 새로고침에서 이전 값이 다시 보일 수 있다(A-11).
   */
  clearSettings: ({ accountId } = {}) => {
    const current = get()
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
    // 해제 의도는 즉시 현재가 된다 — 이 시점 이후의 옛 생산자 쓰기는 전부 무효다.
    const generation = current.selectionGeneration + 1
    set({ selectionGeneration: generation, enabled: false, pendingRetry: null })

    if (key === null) {
      set({ status: NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED })
      return { ok: false, status: NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED }
    }

    if (removeRecordVerified(key)) {
      set({ status: NEXT_ROOM_SETTINGS_STATUS.CLEARED })
      return { ok: true, status: NEXT_ROOM_SETTINGS_STATUS.CLEARED }
    }
    // 삭제가 실패해도 **복원 원본은 남기지 않는다**. 비활성 레코드에는 source가 없다.
    if (writeRecordVerified(key, buildDisabledRecord(accountId))) {
      set({ status: NEXT_ROOM_SETTINGS_STATUS.CLEARED })
      return { ok: true, status: NEXT_ROOM_SETTINGS_STATUS.CLEARED }
    }
    set({
      status: NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED,
      pendingRetry: { kind: "clear", accountId, generation },
    })
    return { ok: false, status: NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED }
  },

  /**
   * 마지막 실패를 다시 시도한다. **캡처한 계정·세대가 아직 현재일 때만** 수행한다 — 그러지
   * 않으면 다른 계정으로 바뀐 뒤의 재시도가 남의 키를 지우거나 옛 원본을 되살린다.
   */
  retryPersist: () => {
    const { pendingRetry, accountId, selectionGeneration } = get()
    if (pendingRetry === null) return { ok: true, status: get().status }
    if (pendingRetry.accountId !== accountId) return { ok: false, status: get().status }
    if (pendingRetry.kind === "clear") {
      if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
      // clearSettings는 세대를 한 번 더 올린다 — 재시도도 그 계약을 그대로 따른다.
      return get().clearSettings({ accountId })
    }
    if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
    return get().keepSettings({ accountId, source: pendingRetry.source })
  },

  /**
   * 다음 방 생성 화면이 읽어 갈 **현재 계정의** 복원 원본을 돌려준다.
   *
   * 읽기만으로 store 상태를 바꾸지 않는다(생성 화면의 조회가 인게임 화면의 체크 상태를
   * 건드리면 안 된다). 오염된 레코드는 정제본을 다시 저장하되, 그 재저장이 실패하면
   * SANITIZE_WRITE_FAILED로 알린다 — 실패를 정상 복원 완료로 바꾸지 않는다(A-11).
   *
   * @returns {{code:string, source:object|null}}
   */
  readRestoreSource: (accountId) => {
    const key = nextRoomSettingsStorageKey(accountId)
    if (key === null) return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.NONE, source: null }
    const storage = getStorage()
    if (storage === null) {
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.STORAGE_UNAVAILABLE, source: null }
    }
    let raw
    try {
      raw = storage.getItem(key)
    } catch {
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.STORAGE_UNAVAILABLE, source: null }
    }

    const record = parseRecord(raw, accountId)
    if (record.kind === "none") return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.NONE, source: null }
    if (record.kind === "disabled") return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED, source: null }
    if (record.kind === "corrupted") {
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.CORRUPTED, source: null }
    }

    if (record.dropped) {
      // 오염된 과거 데이터는 정제본으로 **매체까지** 고쳐 둔다. 다음 읽기가 같은 정제를 다시
      // 하지 않아도 되고, 무엇보다 저장 매체에 폐기된 키가 남아 있지 않아야 한다(RESTORE-24).
      if (!writeRecordVerified(key, buildRecord(accountId, record.source))) {
        return {
          code: NEXT_ROOM_SETTINGS_RESTORE_CODES.SANITIZE_WRITE_FAILED,
          source: record.source,
        }
      }
    }
    return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.RESTORED, source: record.source }
  },

  /** 시험 전용: 메모리 상태를 초기값으로 되돌린다(영속 키는 건드리지 않는다). */
  __resetForTests: () => set({ ...INITIAL_STATE }),
}))
