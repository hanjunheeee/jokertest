// 저장소에서 읽은 복원 결과로 설정 폼 첫 값·폼 초기화 키·안내 문구 정하기
// hooks/useGameSetupPage가 씀
import { NEXT_ROOM_SETTINGS_RESTORE_CODES as CODES, RESTORE_NOTICES } from "../constants/nextRoomSettings.js"
import { buildRoomSettingsFormState } from "./roomSettingsForm/formState.js"

// read = readRestoreSource 결과, base = 계정·계정 세대로 만든 키 앞부분
export function resolveRestore(read, base) {
  const key = `${base}:${read.code}`

  // 복원할 것 없음 / 유지 꺼짐
  if (read.code === CODES.NONE || read.code === CODES.DISABLED) {
    return { formState: null, resetKey: key, notice: "" }
  }
  // 기본값으로 시작하되 이유를 알림
  if (read.code === CODES.DISABLED_PERSIST_FAILED) {
    return { formState: null, resetKey: key, notice: RESTORE_NOTICES.DISABLED_PERSIST_FAILED }
  }
  if (read.code === CODES.CORRUPTED) {
    return { formState: null, resetKey: key, notice: RESTORE_NOTICES.CORRUPTED }
  }
  if (read.code === CODES.STORAGE_UNAVAILABLE) {
    return { formState: null, resetKey: key, notice: RESTORE_NOTICES.STORAGE_UNAVAILABLE }
  }

  // 복원값을 폼으로 못 바꾸면 기본값
  const form = buildRoomSettingsFormState(read.source)
  if (!form.ok) {
    return {
      formState: null,
      resetKey: `${key}:form-${form.code}`,
      notice: RESTORE_NOTICES.FORM_INVALID,
    }
  }
  return {
    formState: form,
    resetKey: `${key}:${read.source.settingsVersion ?? ""}`,
    notice: read.code === CODES.SANITIZE_WRITE_FAILED ? RESTORE_NOTICES.SANITIZE_WRITE_FAILED : "",
  }
}
