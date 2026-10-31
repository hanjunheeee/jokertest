import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { SOUND_SETTING_VOLUMES } from "../constants/soundSettings.js"
import { GENERAL_SETTING_CHECKBOXES, GENERAL_SETTING_TEXT_SIZE } from "../constants/generalSettings.js"

const SETTINGS_STORAGE_KEY = "settings-storage"

const HIDDEN_GENERAL_CHECK_IDS = new Set(["fullscreen", "whisper"])

export const CHAT_TEXT_SIZE_STORAGE_RANGE = { min: 0, max: 100 }

export const CHAT_CHECK_STORAGE_IDS = ["show-time", "nickname-color"]

function defaultVolumes() {
  return Object.fromEntries(
    SOUND_SETTING_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
  )
}

function defaultGeneralChecks() {
  return Object.fromEntries(
    GENERAL_SETTING_CHECKBOXES.filter(({ id }) => !HIDDEN_GENERAL_CHECK_IDS.has(id)).map(
      ({ id, defaultChecked }) => [id, defaultChecked],
    ),
  )
}

const GENERAL_CHECK_STORAGE_IDS = new Set(Object.keys(defaultGeneralChecks()))
const CHAT_CHECK_STORAGE_ID_SET = new Set(CHAT_CHECK_STORAGE_IDS)

export const SFX_MUTED_DEFAULT = false

let lastStorageWriteError = null

export function getSettingsStorageWriteError() {
  return lastStorageWriteError
}

export function clearSettingsStorageWriteError() {
  lastStorageWriteError = null
}

function reportStorageFailure(error, message) {
  lastStorageWriteError = error
  console.warn(`[settings] ${message}`, error)
}

function createMemoryStorage() {
  const memory = new Map()
  return {
    getItem: (name) => (memory.has(name) ? memory.get(name) : null),
    setItem: (name, value) => {
      memory.set(name, value)
    },
    removeItem: (name) => {
      memory.delete(name)
    },
  }
}

function createUnavailableStorage(error) {
  const memory = createMemoryStorage()
  reportStorageFailure(error, "기기 저장소를 쓸 수 없습니다 — 이번 세션에만 유지됩니다.")

  return {
    getItem: memory.getItem,
    removeItem: memory.removeItem,
    setItem: (name, value) => {
      memory.setItem(name, value)
      reportStorageFailure(error, "기기 저장소를 쓸 수 없습니다 — 이번 세션에만 유지됩니다.")
    },
  }
}

function resolveBrowserStorage() {
  try {
    if (typeof localStorage === "undefined") return createMemoryStorage()
  } catch (error) {
    return createUnavailableStorage(error)
  }

  return {
    getItem: (name) => {
      let raw
      try {
        raw = localStorage.getItem(name)
      } catch (error) {
        reportStorageFailure(error, "기기 저장소를 읽지 못했습니다 — 기본값으로 시작합니다.")
        return null
      }

      if (raw === null) return null

      try {
        JSON.parse(raw)
      } catch {
        return null
      }
      return raw
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
        lastStorageWriteError = null
      } catch (error) {
        reportStorageFailure(error, "기기 저장에 실패했습니다 — 이번 세션에만 유지됩니다.")
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name)
      } catch {
      }
    },
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function clampNumber(value, { min, max, fallback }) {
  if (!isFiniteNumber(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function sanitizeVolumes(value, currentVolumes) {
  const base = {}
  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    base[id] = isFiniteNumber(currentVolumes?.[id]) ? currentVolumes[id] : defaultValue
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) return base

  const next = { ...base }
  for (const { id, min, max } of SOUND_SETTING_VOLUMES) {
    if (!Object.hasOwn(value, id)) continue
    next[id] = clampNumber(value[id], { min, max, fallback: base[id] })
  }
  return next
}

function sanitizeBooleanMap(value, allowedIds) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null

  const next = {}
  for (const id of allowedIds) {
    if (!Object.hasOwn(value, id)) continue
    const checked = value[id]
    if (typeof checked === "boolean") next[id] = checked
  }
  return next
}

function mergePersistedSettings(persisted, current) {
  if (typeof persisted !== "object" || persisted === null) return current

  const volumes = sanitizeVolumes(persisted.volumes, current.volumes)

  const restoredGeneralChecks = sanitizeBooleanMap(
    persisted.generalChecks,
    GENERAL_CHECK_STORAGE_IDS,
  )
  const generalChecks =
    restoredGeneralChecks !== null
      ? { ...current.generalChecks, ...restoredGeneralChecks }
      : current.generalChecks

  const generalTextSize = clampNumber(persisted.generalTextSize, {
    min: GENERAL_SETTING_TEXT_SIZE.min,
    max: GENERAL_SETTING_TEXT_SIZE.max,
    fallback: current.generalTextSize,
  })

  const chatChecks = sanitizeBooleanMap(persisted.chatChecks, CHAT_CHECK_STORAGE_ID_SET)

  const sfxMuted = typeof persisted.sfxMuted === "boolean" ? persisted.sfxMuted : current.sfxMuted

  const chatTextSize = clampNumber(persisted.chatTextSize, {
    ...CHAT_TEXT_SIZE_STORAGE_RANGE,
    fallback: current.chatTextSize,
  })

  return { ...current, volumes, generalChecks, generalTextSize, chatChecks, chatTextSize, sfxMuted }
}

export const useSettingsStore = create(
  persist(
    (set) => ({
      volumes: defaultVolumes(),
      setVolume: (id, next) =>
        set((s) => ({ volumes: { ...s.volumes, [id]: next } })),

      sfxMuted: SFX_MUTED_DEFAULT,
      setSfxMuted: (next) =>
        set((s) => (typeof next === "boolean" ? { sfxMuted: next } : s)),
      toggleSfxMuted: () => set((s) => ({ sfxMuted: !s.sfxMuted })),

      inGameSettingTab: null,
      setInGameSettingTab: (tabId) => set({ inGameSettingTab: tabId }),

      generalChecks: defaultGeneralChecks(),
      setGeneralCheck: (id, next) =>
        set((s) => ({ generalChecks: { ...s.generalChecks, [id]: next } })),

      generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
      setGeneralTextSize: (next) => set({ generalTextSize: next }),

      chatChecks: null,
      setChatCheck: (id, next) =>
        set((s) => ({ chatChecks: { ...(s.chatChecks ?? {}), [id]: next } })),

      chatTextSize: null,
      setChatTextSize: (next) => set({ chatTextSize: next }),

      resetSettings: () =>
        set({
          volumes: defaultVolumes(),
          generalChecks: defaultGeneralChecks(),
          generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
          chatChecks: null,
          chatTextSize: null,
          sfxMuted: SFX_MUTED_DEFAULT,
        }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(resolveBrowserStorage),
      partialize: (s) => ({
        volumes: s.volumes,
        generalChecks: s.generalChecks,
        generalTextSize: s.generalTextSize,
        chatChecks: s.chatChecks,
        chatTextSize: s.chatTextSize,
        sfxMuted: s.sfxMuted,
      }),
      merge: (persisted, current) => mergePersistedSettings(persisted, current),
    },
  ),
)

export { defaultVolumes as buildDefaultSoundVolumes, defaultGeneralChecks as buildDefaultGeneralChecks }

export { sanitizeVolumes as sanitizePersistedVolumes, clampNumber as clampPersistedNumber }

export const GENERAL_CHECK_STORAGE_ID_LIST = [...GENERAL_CHECK_STORAGE_IDS]
