// 다음 게임 설정 유지 켜기(저장)·끄기(지우기)·실패한 저장 다시 하기 액션
// store/nextRoomSettingsStore가 create 안에 펼쳐 넣음
// 계정이 바뀌거나 선택 세대가 바뀌면 그사이 끝난 저장 결과는 반영 안 함
import { SETTINGS_STATUS as STATUS } from "../../constants/nextRoomSettings.js"
import { sanitizeRestoreSource } from "../../utils/roomSettingsSourceSanitize.js"
import {
  buildDisabledRecord,
  buildRecord,
  nextRoomSettingsStorageKey,
} from "../../utils/nextRoomRecord.js"
import { isNonEmptyString } from "../../../shared/utils/valueChecks.js"
import { removeVerified, writeVerified } from "./storage.js"

// 저장·지우기·다시 하기 액션 묶음
export const persistActions = (set, get) => ({
  // 유지 켜기: 정리한 설정 원본을 저장, 실패하면 다시 할 거리로 남김
  keepSettings: ({ accountId, source } = {}) => {
    const current = get()
    // 다른 계정 요청이면 안 함
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
    const sanitized = sanitizeRestoreSource(source)
    // 저장 키 없거나 정리 실패면 저장 실패
    if (key === null || !sanitized.ok) {
      set({ status: STATUS.SAVE_FAILED, enabled: false, pendingRetry: null })
      return { ok: false, status: STATUS.SAVE_FAILED }
    }

    const generation = current.selectionGeneration
    const record = buildRecord(accountId, sanitized.source)
    const ok = writeVerified(key, record)

    // 저장하는 사이 계정·선택이 바뀌었으면 결과 버림
    const after = get()
    if (after.accountId !== accountId || after.selectionGeneration !== generation) {
      return { ok: false, status: after.status }
    }

    // 저장 실패: 다시 할 거리로 남김
    if (!ok) {
      set({
        status: STATUS.SAVE_FAILED,
        enabled: false,
        pendingRetry: { kind: "keep", accountId, source: sanitized.source, generation },
      })
      return { ok: false, status: STATUS.SAVE_FAILED }
    }
    set({
      status: STATUS.SAVED,
      enabled: true,
      pendingRetry: null,
      clearIntent: false,
    })
    return { ok: true, status: STATUS.SAVED }
  },

  // 유지 끄기: 지우기가 안 되면 끔 레코드로 덮음, 둘 다 안 되면 다시 할 거리로 남김
  // 지우려는 뜻(clearIntent)을 먼저 기억해서 저장소가 실패해도 이 탭에선 복원 안 함
  clearSettings: ({ accountId } = {}) => {
    const current = get()
    // 다른 계정 요청이면 안 함
    if (!isNonEmptyString(accountId) || current.accountId !== accountId) {
      return { ok: false, status: current.status }
    }
    const key = nextRoomSettingsStorageKey(accountId)
    // 선택 세대 올리고 지우려는 뜻 먼저 기억
    const generation = current.selectionGeneration + 1
    set({ selectionGeneration: generation, enabled: false, pendingRetry: null, clearIntent: true })

    // 저장 키 없으면 지우기 실패
    if (key === null) {
      set({ status: STATUS.CLEAR_FAILED })
      return { ok: false, status: STATUS.CLEAR_FAILED }
    }

    // 지우기 → 안 되면 끔 레코드로 덮기 → 둘 다 안 되면 다시 할 거리
    if (removeVerified(key)) {
      set({ status: STATUS.CLEARED })
      return { ok: true, status: STATUS.CLEARED }
    }
    if (writeVerified(key, buildDisabledRecord(accountId))) {
      set({ status: STATUS.CLEARED })
      return { ok: true, status: STATUS.CLEARED }
    }
    set({
      status: STATUS.CLEAR_FAILED,
      pendingRetry: { kind: "clear", accountId, generation },
    })
    return { ok: false, status: STATUS.CLEAR_FAILED }
  },

  // 실패한 저장·지우기 다시 하기: 같은 계정·같은 선택 세대일 때만
  retryPersist: () => {
    const { pendingRetry, accountId, selectionGeneration } = get()
    // 다시 할 거리 없으면 지금 상태 그대로
    if (pendingRetry === null) return { ok: true, status: get().status }
    if (pendingRetry.accountId !== accountId) return { ok: false, status: get().status }
    if (pendingRetry.kind === "clear") {
      if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
      return get().clearSettings({ accountId })
    }
    if (pendingRetry.generation !== selectionGeneration) return { ok: false, status: get().status }
    return get().keepSettings({ accountId, source: pendingRetry.source })
  },
})
