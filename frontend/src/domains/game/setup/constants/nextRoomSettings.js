// 다음 게임 설정 유지(브라우저 저장) 상수·복원 안내 문구
// store/nextRoomSettings·utils/nextRoomRecord·utils/resolveRestore가 씀

// 저장 레코드 모양이 바뀌면 올림 (옛 레코드는 깨진 것으로 봄)
export const NEXT_ROOM_SETTINGS_SCHEMA_VERSION = 1

// localStorage 키 앞부분, 뒤에 계정 id 붙임
export const KEY_PREFIX = "joker:next-room-settings:v1:"

// 레코드에 있어도 되는 키 (그 밖의 키가 있으면 정리해서 다시 씀)
export const ALLOWED_RECORD_KEYS = Object.freeze(["schemaVersion", "accountId", "enabled", "source"])

// 저장·지우기 상태
export const NEXT_ROOM_SETTINGS_STATUS = Object.freeze({
  IDLE: "IDLE",
  PENDING: "PENDING",
  SAVED: "SAVED",
  CLEARED: "CLEARED",
  SAVE_FAILED: "SAVE_FAILED",
  CLEAR_FAILED: "CLEAR_FAILED",
})

// 복원 결과 코드
export const NEXT_ROOM_SETTINGS_RESTORE_CODES = Object.freeze({
  NONE: "NONE",
  DISABLED: "DISABLED",
  DISABLED_PERSIST_FAILED: "DISABLED_PERSIST_FAILED",
  RESTORED: "RESTORED",
  CORRUPTED: "CORRUPTED",
  SANITIZE_WRITE_FAILED: "SANITIZE_WRITE_FAILED",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
})

// 복원 결과 안내 문구 (utils/resolveRestore가 씀)
export const RESTORE_NOTICES = Object.freeze({
  DISABLED_PERSIST_FAILED:
    "설정 유지 해제를 저장하지 못했습니다. 이 화면은 기본값으로 시작하지만 새로고침하면 이전 설정이 다시 보일 수 있습니다.",
  CORRUPTED: "저장된 다음 게임 설정을 불러오지 못해 기본값으로 시작합니다.",
  STORAGE_UNAVAILABLE: "이 브라우저에서는 설정을 저장·복원할 수 없어 기본값으로 시작합니다.",
  FORM_INVALID: "저장된 다음 게임 설정을 이 화면에서 표현할 수 없어 기본값으로 시작합니다.",
  SANITIZE_WRITE_FAILED: "저장된 설정을 정리해 복원했지만 정리된 값을 다시 저장하지 못했습니다.",
})
