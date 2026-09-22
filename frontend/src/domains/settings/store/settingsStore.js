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

/** 저장을 허용하는 채팅 체크박스 id — 인게임 설정(INGAME_SETTING_CHAT_CHECKBOXES)과 같아야
 *  한다. 설정 도메인이 인게임 도메인을 거꾸로 import하지 않으므로(위 저장 범위와 같은 이유)
 *  값을 여기 두고, 시험이 실제 정의와 대조한다. */
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

/** 복원을 허용하는 일반 체크박스 id — 기본값과 같은 출처(GENERAL_SETTING_CHECKBOXES)에서
 *  만들어 숨김 항목·모르는 키가 저장값으로 되살아나지 않게 한다(AC-01/AC-06). */
const GENERAL_CHECK_STORAGE_IDS = new Set(Object.keys(defaultGeneralChecks()))
const CHAT_CHECK_STORAGE_ID_SET = new Set(CHAT_CHECK_STORAGE_IDS)

/** F-16(AC-03): 효과음 음소거 기본값. 볼륨(master 100 × sfx 80 → gain 0.8)과 함께
 *  기기 저장·초기화 대상이다. 이 값은 **효과음에만** 적용된다 — 배경음은 이 값과
 *  무관하게 volumes["master-volume"] × volumes["bgm-volume"]만 따른다(2026-09-22 AUDIO-01
 *  완화 뒤 useBgmAutoplay·useAudioControl이 그 두 값을 구독한다). */
export const SFX_MUTED_DEFAULT = false

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

/** 기기 저장이 불가능하거나 실패했음을 기존 오류 채널로 보고한다 — 새 채널을 만들지 않고
 *  getSettingsStorageWriteError()로 확인할 수 있게 한다(AC-06). */
function reportStorageFailure(error, message) {
  lastStorageWriteError = error
  console.warn(`[settings] ${message}`, error)
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

/** localStorage 자체에 접근할 수 없는 환경(프라이빗 모드·저장소 정책 차단 등)용 fallback.
 *
 *  화면은 계속 동작해야 하므로 메모리 저장소를 그대로 쓰되, 이 경로의 쓰기는 **한 번도**
 *  기기에 남지 않는다. 그래서 resolve 시점에 한 번만 기록하지 않고 setItem마다 다시
 *  보고한다 — 한 번만 기록하면 clearSettingsStorageWriteError() 이후로 영원히 null이 되어
 *  "저장됐다"는 거짓 표시가 된다(AC-06). */
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
    // 저장소가 아예 없는 환경(SSR·비브라우저 러너)은 오류가 아니라 정상 조건이라 보고하지
    // 않는다. 반대로 getter 자체가 던지는 것은 실제 저장소 사용 불가이므로 보고한다.
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
        // 읽기 자체가 막혔다 — 저장소를 쓸 수 없다는 뜻이므로 조용히 넘기지 않는다.
        reportStorageFailure(error, "기기 저장소를 읽지 못했습니다 — 기본값으로 시작합니다.")
        return null
      }

      if (raw === null) return null

      try {
        JSON.parse(raw) // 손상된 JSON이면 여기서 걸러 초기 상태로 대체한다.
      } catch {
        // 저장소는 살아 있고 값만 손상된 경우다 — 다음 쓰기가 정상적으로 덮으므로
        // 저장 실패로 보고하지 않는다(위의 사용 불가와 다른 사건이다).
        return null
      }
      return raw
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
        lastStorageWriteError = null
      } catch (error) {
        // 쓰기 실패(용량 초과·프라이빗 모드 등) — 던지지 않아 화면은 계속 동작하지만,
        // "저장됐다"고 두지 않는다. 실패를 기록하고 경고를 남겨
        // getSettingsStorageWriteError()로 확인할 수 있게 한다(AC-06).
        reportStorageFailure(error, "기기 저장에 실패했습니다 — 이번 세션에만 유지됩니다.")
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

/**
 * 저장된 값이 "실제로 숫자"인지 확인한다(AC-06).
 *
 * Number(value) 변환에 기대면 안 된다 — Number(null) === 0, Number("") === 0,
 * Number("  ") === 0, Number([]) === 0, Number([50]) === 50, Number(true) === 1이라
 * 손상된 localStorage 내용이 모두 "유효한 숫자"로 통과해 볼륨이 0으로 떨어지거나 엉뚱한
 * 값이 된다. 숫자 타입이면서 유한한 값만 받아들이고, 나머지는 호출부가 현재값·기본값을
 * 유지하게 한다.
 * @param {unknown} value
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

/** 숫자 타입·유한성 검증 후 min·max로 보정한다 — 검증에 실패하면 fallback을 그대로 쓴다. */
function clampNumber(value, { min, max, fallback }) {
  if (!isFiniteNumber(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 저장된 볼륨 맵 검증 — SOUND_SETTING_VOLUMES에 없는 id는 버리고, 숫자가 아닌 값(null·
 *  문자열·배열·boolean·NaN·Infinity)은 현재값(없으면 정의된 기본값)을 유지하며, 각
 *  슬라이더의 min·max로 보정한다. 손상된 값이 그대로 슬라이더·오디오 경로에 흘러들지
 *  않게 한다(AC-06). */
function sanitizeVolumes(value, currentVolumes) {
  // 현재값 자체가 손상됐을 수도 있으므로 먼저 "알려진 id + 유효한 숫자"만 남긴 기준을 만든다.
  const base = {}
  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    base[id] = isFiniteNumber(currentVolumes?.[id]) ? currentVolumes[id] : defaultValue
  }

  // 배열도 typeof === "object"라 따로 걸러낸다 — 볼륨 맵은 객체여야 한다.
  if (typeof value !== "object" || value === null || Array.isArray(value)) return base

  const next = { ...base }
  for (const { id, min, max } of SOUND_SETTING_VOLUMES) {
    if (!Object.hasOwn(value, id)) continue
    next[id] = clampNumber(value[id], { min, max, fallback: base[id] })
  }
  return next
}

/**
 * 저장된 체크박스 맵 검증(AC-06).
 *
 * 이전 구현은 (a) 배열을 걸러내지 않아 `[]`가 `{}`로, `[true,false]`가 `{0:true,1:false}`로
 * 통과했고 (b) 화이트리스트가 없어 손상·구버전 localStorage의 모르는 키가 그대로 상태에
 * 남았다. generalChecks는 `{...current, ...sanitized}`로 병합되므로 그런 키가 축적된다.
 *
 * 알려진 id이면서 값이 진짜 boolean인 항목만 남긴다 — 유효한 `false`는 falsy라고 버리지
 * 않고 그대로 보존한다(그러지 않으면 "전부 기본값"으로 퇴화한다).
 *
 * @param {unknown} value
 * @param {Set<string>} allowedIds
 * @returns {Record<string, boolean> | null} 맵이 아니면 null(호출부가 현재값을 유지한다)
 */
function sanitizeBooleanMap(value, allowedIds) {
  // 배열도 typeof === "object"라 따로 걸러낸다 — 체크박스 맵은 객체여야 한다.
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null

  const next = {}
  for (const id of allowedIds) {
    if (!Object.hasOwn(value, id)) continue
    const checked = value[id]
    if (typeof checked === "boolean") next[id] = checked
  }
  return next
}

/** 복원한 값의 타입·범위를 검증해 손상된 localStorage 내용이 그대로 상태에 반영되지
 *  않게 한다 — 검증에 실패한 필드는 현재(초기) 값으로 대체한다. */
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

  // 숫자 설정은 모두 clampNumber를 거친다 — Number 변환을 쓰면 null·""·[]·[3]·true가
  // 전부 유효한 숫자로 통과해 저장값이 엉뚱하게 바뀐다(AC-06).
  const generalTextSize = clampNumber(persisted.generalTextSize, {
    min: GENERAL_SETTING_TEXT_SIZE.min,
    max: GENERAL_SETTING_TEXT_SIZE.max,
    fallback: current.generalTextSize,
  })

  // chatChecks는 "아직 고른 적 없음"(null)을 그대로 보존한다 — 기본값은 인게임 도메인이 정한다.
  const chatChecks = sanitizeBooleanMap(persisted.chatChecks, CHAT_CHECK_STORAGE_ID_SET)

  // F-16(AC-03): 효과음 음소거는 진짜 boolean일 때만 복원한다 — 손상된 값("true", 1, null)이
  // 통과해 "음소거인데 소리가 난다"거나 그 반대가 되지 않게 한다. 검증 실패는 현재값 유지다.
  const sfxMuted = typeof persisted.sfxMuted === "boolean" ? persisted.sfxMuted : current.sfxMuted

  // 채팅 글자 크기는 인게임 도메인(INGAME_SETTING_CHAT_SLIDER)이 정의하지만, 설정
  // 도메인이 인게임 도메인을 거꾸로 import하지 않기 위해 저장 범위만 여기에 둔다 —
  // 두 값이 어긋나면 __tests__/settingsStore.test.js가 실제 슬라이더 정의와 대조해 잡는다.
  const chatTextSize = clampNumber(persisted.chatTextSize, {
    ...CHAT_TEXT_SIZE_STORAGE_RANGE,
    fallback: current.chatTextSize,
  })

  return { ...current, volumes, generalChecks, generalTextSize, chatChecks, chatTextSize, sfxMuted }
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

      // F-16(AC-03): 효과음 음소거. 설정 화면과 인게임 설정 패널이 같은 값을 조작하고,
      // 공통 재생기(createSfxPlayer)가 getMix()에서 이 값을 읽어 유효 gain을 0으로 만든다.
      // 볼륨과 독립이라 음소거 중에 볼륨을 바꿔도 음소거는 유지되고, 해제하면 그때의
      // 최신 Master×SFX 곱이 그대로 적용된다.
      sfxMuted: SFX_MUTED_DEFAULT,
      setSfxMuted: (next) =>
        // boolean이 아닌 값이 상태에 들어가면 이후 저장·복원 검증이 의미를 잃는다.
        set((s) => (typeof next === "boolean" ? { sfxMuted: next } : s)),
      toggleSfxMuted: () => set((s) => ({ sfxMuted: !s.sfxMuted })),

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
      // MUSIC_PLAYBACK_ENABLED 같은 음악 정책 상수는 이 store가 갖고 있지 않으므로 초기화가
      // 건드릴 방법 자체가 없다. 초기화는 배경음 볼륨을 기본값으로 되돌릴 뿐 재생을 새로 시작하지 않는다.
      resetSettings: () =>
        set({
          volumes: defaultVolumes(),
          generalChecks: defaultGeneralChecks(),
          generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
          chatChecks: null,
          chatTextSize: null,
          // F-16(AC-03): 효과음 음소거도 정해진 기본값으로 되돌린다. 초기화 결과는 persist
          // 미들웨어가 곧바로 기기에 다시 쓰므로 다음 새로고침에서도 이 값이 복원된다(A-03).
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

/** 볼륨 초기값 — 테스트·초기화에서 store 기본 상태를 다시 만들 때 씁니다. */
export { defaultVolumes as buildDefaultSoundVolumes, defaultGeneralChecks as buildDefaultGeneralChecks }

/** 복원 검증 로직 — JSON으로는 표현할 수 없는 값(NaN 등)까지 회귀 시험이 직접 확인할 수
 *  있도록 내보낸다(AC-06). */
export { sanitizeVolumes as sanitizePersistedVolumes, clampNumber as clampPersistedNumber }

/** 복원 허용 id 집합 — 시험이 실제 체크박스 정의와 대조한다(AC-06). */
export const GENERAL_CHECK_STORAGE_ID_LIST = [...GENERAL_CHECK_STORAGE_IDS]
