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
import {
  isPlainObject,
  sanitizeRestoreSource,
  sanitizeRoomSettings,
} from "../utils/roomSettingsSourceSanitize.js"

// 정제 자체는 순수 모듈이 소유한다(같은 정제를 스냅샷 경계도 쓴다). 기존 호출부·시험이 이
// 모듈 경로로 참조하고 있으므로 이름은 그대로 다시 내보낸다.
export { sanitizeRestoreSource, sanitizeRoomSettings }

/** 저장 스키마 버전. 모양이 바뀌면 올리고, 다른 버전의 레코드는 복원하지 않는다. */
export const NEXT_ROOM_SETTINGS_SCHEMA_VERSION = 1

/** 키 접두사. 계정 uuid는 encodeURIComponent로 감싸 구분자 충돌을 막는다. */
const KEY_PREFIX = "joker:next-room-settings:v1:"

/**
 * 저장 레코드의 최상위 허용 키. 레코드 **자체**에 붙은 폐기된 키(과거 버전이 남긴 잔재)도
 * 정제 대상이다 — source 안만 훑으면 그 키가 매체에 그대로 남는다.
 */
const ALLOWED_RECORD_KEYS = Object.freeze(["schemaVersion", "accountId", "enabled", "source"])

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
  /**
   * 이 탭에서 유지를 **껐는데** 그 해제를 매체에 남기지 못했고, 옛 레코드가 아직 남아 있다.
   *
   * 복원하지 않는다는 점에서는 DISABLED와 같지만(해제 의도가 저장 실패보다 우선한다),
   * 새로고침하면 이전 설정이 다시 보일 수 있다는 사실이 다르다 — 그 차이를 화면이 알려야
   * 하므로 같은 코드로 뭉개지 않는다(A-11).
   */
  DISABLED_PERSIST_FAILED: "DISABLED_PERSIST_FAILED",
  /** 정상 복원. */
  RESTORED: "RESTORED",
  /** 레코드가 깨졌다(JSON 손상·스키마 불일치·필수값 누락·계정 불일치). */
  CORRUPTED: "CORRUPTED",
  /** 정제는 했지만 그 정제본을 다시 저장하지 못했다 — 복원값은 쓰되 실패를 알린다. */
  SANITIZE_WRITE_FAILED: "SANITIZE_WRITE_FAILED",
  /** 저장 매체 자체를 읽을 수 없다(사생활 모드·차단 등). */
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
})

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
  // 레코드 **최상위**의 폐기된 키도 정제 대상이다. source 안만 훑으면 네 허용 키 옆에
  // 나란히 붙은 과거 오염(레코드 자체에 달린 잔재 필드)이 매체에 그대로 남는다 —
  // 정제본을 다시 저장할 이유가 여기서 만들어진다(RESTORE-24).
  const recordDropped = Object.keys(parsed).some((key) => !ALLOWED_RECORD_KEYS.includes(key))
  if (parsed.enabled !== true) return { kind: "disabled", dropped: recordDropped }

  const sanitized = sanitizeRestoreSource(parsed.source)
  if (!sanitized.ok) return { kind: "corrupted" }
  return { kind: "enabled", source: sanitized.source, dropped: sanitized.dropped || recordDropped }
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
  /**
   * F-24(AC-05): 이 계정이 **이 탭에서 유지를 껐다**는 사실. 영속 성공 여부와 별개다.
   *
   * 해제 의도는 저장 실패보다 우선한다 — 삭제도 비활성 쓰기도 실패해 옛 레코드가 매체에
   * 남아 있을 때, 그 레코드를 읽어 과거 설정을 복원하면 사용자가 방금 끈 설정으로 다음 방이
   * 만들어진다. 의도는 메모리에서 이미 확정됐으므로 읽기 경로가 그 의도를 존중한다.
   */
  clearIntent: false,
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
    // 켜기가 확인됐으므로 이 계정의 해제 의도는 더 이상 현재가 아니다.
    set({
      status: NEXT_ROOM_SETTINGS_STATUS.SAVED,
      enabled: true,
      pendingRetry: null,
      clearIntent: false,
    })
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
    // 해제 의도는 즉시 현재가 된다 — 이 시점 이후의 옛 생산자 쓰기는 전부 무효다. clearIntent도
    // 여기서 켠다(영속 결과와 무관하다): 아래 두 저장 작업이 모두 실패해도 "껐다"는 사실은
    // 이미 확정이고, 읽기 경로가 그 사실을 남은 레코드보다 우선한다(AC-05).
    const generation = current.selectionGeneration + 1
    set({ selectionGeneration: generation, enabled: false, pendingRetry: null, clearIntent: true })

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
   * **해제 의도가 저장 실패보다 우선한다**(AC-05). 이 탭에서 유지를 껐는데 삭제도 비활성
   * 쓰기도 실패해 옛 레코드가 남아 있다면, 그 레코드를 읽어 과거 설정을 복원하지 않는다 —
   * 사용자가 방금 끈 설정으로 다음 방이 만들어지는 쪽이 새로고침 뒤 값이 되살아나는 것보다
   * 나쁘다. 대신 남은 레코드를 한 번 더 정리해 보고, 끝내 남으면 그 사실을 코드로 알린다.
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

    const memory = get()
    const hasClearIntent = memory.clearIntent === true && memory.accountId === accountId

    const record = parseRecord(raw, accountId)

    if (hasClearIntent) {
      if (record.kind === "none") return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED, source: null }
      if (record.kind === "disabled" && !record.dropped) {
        return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED, source: null }
      }
      // 해제가 매체에 남지 못했다(또는 오염이 남았다). 복원은 하지 않고 정리만 다시 시도한다.
      const cleaned = removeRecordVerified(key) || writeRecordVerified(key, buildDisabledRecord(accountId))
      return {
        code: cleaned
          ? NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED
          : NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED_PERSIST_FAILED,
        source: null,
      }
    }

    if (record.kind === "none") return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.NONE, source: null }
    if (record.kind === "disabled") {
      // 비활성 레코드에 붙은 폐기된 키도 매체에서 걷어낸다(복원하지 않더라도 남기지 않는다).
      if (record.dropped) writeRecordVerified(key, buildDisabledRecord(accountId))
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED, source: null }
    }
    if (record.kind === "corrupted") {
      // 쓸 수 없는 레코드를 매체에 그대로 두면 그 안의 폐기된 키도 함께 남는다. 복원 근거로
      // 삼을 수 없는 값이므로 지우고, 지우지 못하면 source 없는 비활성 표식으로 덮는다.
      if (!removeRecordVerified(key)) writeRecordVerified(key, buildDisabledRecord(accountId))
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
