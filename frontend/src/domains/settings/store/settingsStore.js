// 파일 역할: settingsStore.js - 설정 화면과 인게임 설정 패널이 함께 쓰는 전역 상태 store입니다.
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { SOUND_SETTING_VOLUMES } from "../constants/soundSettings.js"
import { GENERAL_SETTING_CHECKBOXES, GENERAL_SETTING_TEXT_SIZE } from "../constants/generalSettings.js"

const SETTINGS_STORAGE_KEY = "settings-storage"

// F-15: 귓속말 알림 항목(AC-01)은 화면에서 제거하는 항목이라 저장 대상에도 두지 않는다.
// fullscreen은 실제 브라우저 전체화면 상태(useFullscreen)를 그대로 보여주는 항목이라
// 저장된 선호값을 갖지 않는다(A-02).
const HIDDEN_GENERAL_CHECK_IDS = new Set(["fullscreen", "whisper"])

/** 채팅 글자 크기 저장 범위 — 인게임 설정 슬라이더(INGAME_SETTING_CHAT_SLIDER)와 같은
 *  값이어야 한다. 설정 도메인이 인게임 도메인을 import하지 않으므로 값을 여기 두고,
 *  시험이 실제 슬라이더 정의와 대조한다. */
export const CHAT_TEXT_SIZE_STORAGE_RANGE = { min: 0, max: 100 }

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

/** 마지막 기기 저장 실패(용량 초과·프라이빗 모드 등). null이면 마지막 쓰기가 성공한
 *  것이다 — 저장에 실패했는데 성공한 것처럼 두지 않기 위해 여기에 남긴다(AC-06). */
let lastStorageWriteError = null

/** 마지막 저장 실패를 돌려준다 — 실패 시 null이 아니다. */
export function getSettingsStorageWriteError() {
  return lastStorageWriteError
}

/** 시험·재시도에서 실패 기록을 지운다. */
export function clearSettingsStorageWriteError() {
  lastStorageWriteError = null
}

/** localStorage에 접근할 수 없거나(SSR·프라이빗 모드 등) 손상된 값을 만나도 던지지 않는
 *  최소 storage 어댑터. 기기에 남기지 못할 뿐 현재 세션 상태는 그대로 유지된다. */
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

function resolveBrowserStorage() {
  try {
    if (typeof localStorage === "undefined") return createMemoryStorage()
  } catch {
    return createMemoryStorage()
  }

  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name)
        if (raw === null) return null
        JSON.parse(raw) // 손상된 JSON이면 여기서 걸러 초기 상태로 대체한다.
        return raw
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
        lastStorageWriteError = null
      } catch (error) {
        // 쓰기 실패(용량 초과·프라이빗 모드 등) — 던지지 않아 화면은 계속 동작하지만,
        // "저장됐다"고 두지 않는다. 실패를 기록하고 경고를 남겨
        // getSettingsStorageWriteError()로 확인할 수 있게 한다(AC-06).
        lastStorageWriteError = error
        console.warn("[settings] 기기 저장에 실패했습니다 — 이번 세션에만 유지됩니다.", error)
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name)
      } catch {
        // noop
      }
    },
  }
}

function clampToRange(value, { min, max, fallback }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 저장된 볼륨 맵 검증 — SOUND_SETTING_VOLUMES에 없는 id는 버리고, 숫자가 아닌 값은
 *  무시하며, 각 슬라이더의 min·max로 보정한다. 손상된 값이 그대로 슬라이더·오디오
 *  경로에 흘러들지 않게 한다(AC-06). */
function sanitizeVolumes(value, currentVolumes) {
  if (typeof value !== "object" || value === null) return currentVolumes

  const next = { ...currentVolumes }
  for (const { id, min, max, defaultValue } of SOUND_SETTING_VOLUMES) {
    if (!Object.hasOwn(value, id)) continue

    const n = Number(value[id])
    if (typeof value[id] === "boolean" || !Number.isFinite(n)) continue

    next[id] = Math.min(max, Math.max(min, n))
    if (!Number.isFinite(next[id])) next[id] = defaultValue
  }
  return next
}

function sanitizeBooleanMap(value) {
  if (typeof value !== "object" || value === null) return null
  const next = {}
  for (const [id, checked] of Object.entries(value)) {
    if (typeof checked === "boolean") next[id] = checked
  }
  return next
}

/** 복원한 값의 타입·범위를 검증해 손상된 localStorage 내용이 그대로 상태에 반영되지
 *  않게 한다 — 검증에 실패한 필드는 현재(초기) 값으로 대체한다. */
function mergePersistedSettings(persisted, current) {
  if (typeof persisted !== "object" || persisted === null) return current

  const volumes = sanitizeVolumes(persisted.volumes, current.volumes)

  const generalChecks =
    sanitizeBooleanMap(persisted.generalChecks) !== null
      ? { ...current.generalChecks, ...sanitizeBooleanMap(persisted.generalChecks) }
      : current.generalChecks

  const generalTextSize = clampToRange(persisted.generalTextSize, {
    min: GENERAL_SETTING_TEXT_SIZE.min,
    max: GENERAL_SETTING_TEXT_SIZE.max,
    fallback: current.generalTextSize,
  })

  const chatChecks = sanitizeBooleanMap(persisted.chatChecks)

  // 채팅 글자 크기는 인게임 도메인(INGAME_SETTING_CHAT_SLIDER)이 정의하지만, 설정
  // 도메인이 인게임 도메인을 거꾸로 import하지 않기 위해 저장 범위만 여기에 둔다 —
  // 두 값이 어긋나면 __tests__/settingsStore.test.js가 실제 슬라이더 정의와 대조해 잡는다.
  const chatTextSize =
    persisted.chatTextSize === null || persisted.chatTextSize === undefined
      ? current.chatTextSize
      : typeof persisted.chatTextSize === "boolean"
        ? current.chatTextSize
        : clampToRange(persisted.chatTextSize, {
            ...CHAT_TEXT_SIZE_STORAGE_RANGE,
            fallback: current.chatTextSize,
          })

  return { ...current, volumes, generalChecks, generalTextSize, chatChecks, chatTextSize }
}

/**
 * 설정 값 store.
 *
 * 사운드 볼륨은 설정 화면(UI-05의 useSoundSettings)과 인게임 설정 패널
 * (useInGameSettingPanel) 두 곳에서 조작한다. 두 화면이 각자 useState를 들면 같은 항목이
 * 화면마다 다른 값을 갖게 되므로, 값은 이 store 한 곳에만 둔다 — 어느 쪽에서 슬라이더를
 * 움직여도 다른 쪽이 같은 값을 읽는다.
 *
 * 인게임 설정 패널의 탭도 여기에 둔다. 패널은 열고 닫힐 때마다 마운트/언마운트되는데
 * (SidePanel의 AnimatePresence), 탭이 컴포넌트 지역 상태면 그때마다 기본 탭으로 되돌아간다.
 * 탭 선택은 기기에 남길 필요가 없는 화면 탐색 상태라 저장 대상에서 뺀다.
 *
 * F-15(AC-06): volumes·generalChecks·generalTextSize·chatChecks·chatTextSize는 기기
 * localStorage에 저장해 새로고침 후에도 유지한다(persist). chatChecks/chatTextSize는
 * 인게임 설정 도메인(ingameSettingData.js)의 기본값을 여기서 참조하지 않는다 — 설정
 * 도메인이 인게임 도메인을 거꾸로 import하지 않기 위해서다(inGameSettingTab과 같은 이유).
 * null은 "아직 고른 적 없음"이고, 기본값이 무엇인지는 그 값을 쓰는 인게임 쪽 컴포넌트가
 * 정한다.
 */
export const useSettingsStore = create(
  persist(
    (set) => ({
      volumes: defaultVolumes(),
      setVolume: (id, next) =>
        set((s) => ({ volumes: { ...s.volumes, [id]: next } })),

      inGameSettingTab: null,
      setInGameSettingTab: (tabId) => set({ inGameSettingTab: tabId }),

      // F-15(AC-01): GENERAL_SETTING_CHECKBOXES 중 fullscreen·whisper를 뺀 나머지(친구
      // 초대·게임 초대·시스템 알림)만 저장 대상이다.
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

      // F-15(AC-02/AC-05): 일반·사운드·채팅 환경설정만 초기화한다 — 계정 데이터나
      // MUSIC_PLAYBACK_ENABLED 같은 음악 차단 정책은 이 store가 갖고 있지 않으므로 초기화가
      // 건드릴 방법 자체가 없다(useAudioControl은 이 store를 구독하지 않는다).
      resetSettings: () =>
        set({
          volumes: defaultVolumes(),
          generalChecks: defaultGeneralChecks(),
          generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
          chatChecks: null,
          chatTextSize: null,
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
      }),
      merge: (persisted, current) => mergePersistedSettings(persisted, current),
    },
  ),
)

/** 볼륨 초기값 — 테스트·초기화에서 store 기본 상태를 다시 만들 때 씁니다. */
export { defaultVolumes as buildDefaultSoundVolumes, defaultGeneralChecks as buildDefaultGeneralChecks }
