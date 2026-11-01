// 다음 게임 설정 복원값 읽기 액션
// store/nextRoomSettingsStore가 create 안에 펼쳐 넣음
// 깨졌거나 허용 밖 키가 섞인 레코드는 읽는 자리에서 정리해서 다시 씀
import { NEXT_ROOM_SETTINGS_RESTORE_CODES as CODES } from "../../constants/nextRoomSettings.js"
import {
  buildDisabledRecord,
  buildRecord,
  nextRoomSettingsStorageKey,
  parseRecord,
} from "../../utils/nextRoomRecord.js"
import { getStorage, removeVerified, writeVerified } from "./storage.js"

export const restoreAction = (set, get) => ({
  readRestoreSource: (accountId) => {
    // 계정 없음 / 저장소 못 씀
    const key = nextRoomSettingsStorageKey(accountId)
    if (key === null) return { code: CODES.NONE, source: null }
    const storage = getStorage()
    if (storage === null) {
      return { code: CODES.STORAGE_UNAVAILABLE, source: null }
    }
    let raw
    try {
      raw = storage.getItem(key)
    } catch {
      return { code: CODES.STORAGE_UNAVAILABLE, source: null }
    }

    const memory = get()
    const hasClearIntent = memory.clearIntent === true && memory.accountId === accountId

    const record = parseRecord(raw, accountId)

    // 이 탭에서 유지를 껐으면 저장소에 뭐가 남아 있든 복원 안 함 (남은 건 다시 지움)
    if (hasClearIntent) {
      if (record.kind === "none") return { code: CODES.DISABLED, source: null }
      if (record.kind === "disabled" && !record.dropped) {
        return { code: CODES.DISABLED, source: null }
      }
      const cleaned = removeVerified(key) || writeVerified(key, buildDisabledRecord(accountId))
      return {
        code: cleaned
          ? CODES.DISABLED
          : CODES.DISABLED_PERSIST_FAILED,
        source: null,
      }
    }

    // 없음 / 끔(군더더기 키는 정리) / 깨짐(지우고, 안 되면 끔 레코드로 덮음)
    if (record.kind === "none") return { code: CODES.NONE, source: null }
    if (record.kind === "disabled") {
      if (record.dropped) writeVerified(key, buildDisabledRecord(accountId))
      return { code: CODES.DISABLED, source: null }
    }
    if (record.kind === "corrupted") {
      if (!removeVerified(key)) writeVerified(key, buildDisabledRecord(accountId))
      return { code: CODES.CORRUPTED, source: null }
    }

    // 켬: 정리한 값이 있으면 다시 쓰고, 다시 쓰기에 실패해도 복원은 함
    if (record.dropped) {
      if (!writeVerified(key, buildRecord(accountId, record.source))) {
        return {
          code: CODES.SANITIZE_WRITE_FAILED,
          source: record.source,
        }
      }
    }
    return { code: CODES.RESTORED, source: record.source }
  },
})
