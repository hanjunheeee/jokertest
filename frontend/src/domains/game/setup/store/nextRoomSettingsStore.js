// 다음 게임 설정 유지 스토어 입구 (액션은 store/nextRoomSettings/)
// 결과 화면·게임 설정 화면·인게임 설정 탭이 씀, 시험이 쓰는 export 이름 그대로 둠
import { create } from "zustand"
import { sanitizeRestoreSource, sanitizeRoomSettings } from "../utils/roomSettingsSourceSanitize.js"
import { SETTINGS_STATUS } from "../constants/nextRoomSettings.js"
import { isNonEmptyString } from "../../shared/utils/valueChecks.js"
import { persistActions } from "./nextRoomSettings/persistActions.js"
import { restoreAction } from "./nextRoomSettings/restoreAction.js"

// 정리 함수 다시 내보냄 (지금 이 경로로 부르는 곳 없음)
export { sanitizeRestoreSource, sanitizeRoomSettings }
// 복원 코드·저장 키 다시 내보냄 (resolveNextGameCreateRoomPayload·시험이 씀)
export { NEXT_ROOM_SETTINGS_RESTORE_CODES } from "../constants/nextRoomSettings.js"
export { nextRoomSettingsStorageKey } from "../utils/nextRoomRecord.js"

// selectionGeneration: 계정 바뀜·유지 끄기마다 올림, clearIntent: 이 탭에서 유지를 끈 뜻
const INITIAL_STATE = Object.freeze({
  accountId: null,
  selectionGeneration: 0,
  enabled: false,
  status: SETTINGS_STATUS.IDLE,
  pendingRetry: null,
  clearIntent: false,
})

export const useNextRoomSettingsStore = create((set, get) => ({
  ...INITIAL_STATE,

  // 계정이 바뀌면 상태를 처음으로 돌리고 세대 올림
  setAccount: (accountId) => {
    const next = isNonEmptyString(accountId) ? accountId : null
    if (get().accountId === next) return
    set((current) => ({
      ...INITIAL_STATE,
      accountId: next,
      selectionGeneration: current.selectionGeneration + 1,
    }))
  },

  ...persistActions(set, get),
  ...restoreAction(set, get),

  // 시험용: 처음 상태로
  __resetForTests: () => set({ ...INITIAL_STATE }),
}))
