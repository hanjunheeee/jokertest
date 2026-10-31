import { create } from "zustand"
import {
  isPlainObject,
  sanitizeRestoreSource,
  sanitizeRoomSettings,
} from "../utils/roomSettingsSourceSanitize.js"

export { sanitizeRestoreSource, sanitizeRoomSettings }

export const NEXT_ROOM_SETTINGS_SCHEMA_VERSION = 1

const KEY_PREFIX = "joker:next-room-settings:v1:"

const ALLOWED_RECORD_KEYS = Object.freeze(["schemaVersion", "accountId", "enabled", "source"])

export const NEXT_ROOM_SETTINGS_STATUS = Object.freeze({
  IDLE: "IDLE",
  PENDING: "PENDING",
  SAVED: "SAVED",
  CLEARED: "CLEARED",
  SAVE_FAILED: "SAVE_FAILED",
  CLEAR_FAILED: "CLEAR_FAILED",
})

export const NEXT_ROOM_SETTINGS_RESTORE_CODES = Object.freeze({
  NONE: "NONE",
  DISABLED: "DISABLED",
  DISABLED_PERSIST_FAILED: "DISABLED_PERSIST_FAILED",
  RESTORED: "RESTORED",
  CORRUPTED: "CORRUPTED",
  SANITIZE_WRITE_FAILED: "SANITIZE_WRITE_FAILED",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
})

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

export function nextRoomSettingsStorageKey(accountId) {
  if (!isNonEmptyString(accountId)) return null
  return `${KEY_PREFIX}${encodeURIComponent(accountId)}`
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function buildRecord(accountId, source) {
  return {
    schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION,
    accountId,
    enabled: true,
    source,
  }
}

function buildDisabledRecord(accountId) {
  return { schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION, accountId, enabled: false }
}

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
  if (parsed.accountId !== accountId) return { kind: "corrupted" }
  const recordDropped = Object.keys(parsed).some((key) => !ALLOWED_RECORD_KEYS.includes(key))
  if (parsed.enabled !== true) return { kind: "disabled", dropped: recordDropped }

  const sanitized = sanitizeRestoreSource(parsed.source)
  if (!sanitized.ok) return { kind: "corrupted" }
  return { kind: "enabled", source: sanitized.source, dropped: sanitized.dropped || recordDropped }
}

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
  accountId: null,
  selectionGeneration: 0,
  enabled: false,
  status: NEXT_ROOM_SETTINGS_STATUS.IDLE,
  pendingRetry: null,
  clearIntent: false,
})

export const useNextRoomSettingsStore = create((set, get) => ({
  ...INITIAL_STATE,

  setAccount: (accountId) => {
    const next = isNonEmptyString(accountId) ? accountId : null
    if (get().accountId === next) return
    set((current) => ({
      ...INITIAL_STATE,
      accountId: next,
      selectionGeneration: current.selectionGeneration + 1,
    }))
  },

  keepSettings: ({ accountId, source } = {}) => {
    const current = get()
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
    const sanitized = sanitizeRestoreSource(source)
    if (key === null || !sanitized.ok) {
      set({ status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED, enabled: false, pendingRetry: null })
      return { ok: false, status: NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED }
    }

    const generation = current.selectionGeneration
    const record = buildRecord(accountId, sanitized.source)
    const ok = writeRecordVerified(key, record)

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
    set({
      status: NEXT_ROOM_SETTINGS_STATUS.SAVED,
      enabled: true,
      pendingRetry: null,
      clearIntent: false,
    })
    return { ok: true, status: NEXT_ROOM_SETTINGS_STATUS.SAVED }
  },

  clearSettings: ({ accountId } = {}) => {
    const current = get()
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
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

  retryPersist: () => {
    const { pendingRetry, accountId, selectionGeneration } = get()
    if (pendingRetry === null) return { ok: true, status: get().status }
    if (pendingRetry.accountId !== accountId) return { ok: false, status: get().status }
    if (pendingRetry.kind === "clear") {
      if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
      return get().clearSettings({ accountId })
    }
    if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
    return get().keepSettings({ accountId, source: pendingRetry.source })
  },

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
      if (record.dropped) writeRecordVerified(key, buildDisabledRecord(accountId))
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED, source: null }
    }
    if (record.kind === "corrupted") {
      if (!removeRecordVerified(key)) writeRecordVerified(key, buildDisabledRecord(accountId))
      return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.CORRUPTED, source: null }
    }

    if (record.dropped) {
      if (!writeRecordVerified(key, buildRecord(accountId, record.source))) {
        return {
          code: NEXT_ROOM_SETTINGS_RESTORE_CODES.SANITIZE_WRITE_FAILED,
          source: record.source,
        }
      }
    }
    return { code: NEXT_ROOM_SETTINGS_RESTORE_CODES.RESTORED, source: record.source }
  },

  __resetForTests: () => set({ ...INITIAL_STATE }),
}))
