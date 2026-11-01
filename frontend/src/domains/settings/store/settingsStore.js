// 설정 스토어 입구 (create·기기 저장 연결, 상태·저장 처리는 settings/ 아래와 utils/)
// 설정 탭·인게임 채팅/설정·알림·글자 배율 동기화·소리 훅이 이 경로로 씀
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { SETTINGS_STORAGE_KEY } from "../constants/settingsStorage.js"
import { GENERAL_CHECK_STORAGE_IDS, mergePersistedSettings } from "../utils/persistedSettings.js"
import { createSettingsStorage } from "./settings/storage.js"
import { settingsState } from "./settings/state.js"

// 시험이 쓰는 이름 그대로 다시 내보냄 (src는 안 씀)
export {
  CHAT_TEXT_SIZE_STORAGE_RANGE,
  CHAT_CHECK_STORAGE_IDS,
  SFX_MUTED_DEFAULT,
} from "../constants/settingsStorage.js"
export {
  defaultVolumes as buildDefaultSoundVolumes,
  defaultGeneralChecks as buildDefaultGeneralChecks,
} from "../utils/settingsDefaults.js"
export {
  sanitizeVolumes as sanitizePersistedVolumes,
  clampNumber as clampPersistedNumber,
} from "../utils/persistedSettings.js"

// 저장 실패 기록은 이 모듈마다 따로 둠 (시험이 새 모듈로 다시 불러 확인함)
const storage = createSettingsStorage()

// 마지막 저장 실패 꺼내기 (시험만 씀)
export function getSettingsStorageWriteError() {
  return storage.getError()
}

// 저장 실패 기록 지움 (시험만 씀)
export function clearSettingsStorageWriteError() {
  storage.clearError()
}

// 저장은 사용자가 바꾸는 값만, 읽을 때는 항목별로 걸러 덮음
export const useSettingsStore = create(
  persist(
    (set) => settingsState(set),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(storage.resolve),
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

// 저장하는 일반 체크 id 배열 (시험만 씀)
export const GENERAL_CHECK_STORAGE_ID_LIST = [...GENERAL_CHECK_STORAGE_IDS]
