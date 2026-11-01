// 방 설정 출처 다듬기 (순수 계산)
// 스냅샷 반영과 판 시작 정보 다듬기가 사용
import { sanitizeRoomSettings } from "../../../setup/utils/roomSettingsSourceSanitize.js"
import { isNonNegativeInteger } from "./checks.js"

// 공개 방식·설정 묶음이 맞을 때만 받고, 설정은 정리해서 넣음 (아니면 null)
export function normRoomSettingsSource(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  if (raw.settings === null || typeof raw.settings !== "object" || Array.isArray(raw.settings)) return null
  if (raw.accessType !== "open" && raw.accessType !== "code") return null
  const { settings } = sanitizeRoomSettings(raw.settings)
  return {
    accessType: raw.accessType,
    settingsVersion: isNonNegativeInteger(raw.settingsVersion) ? raw.settingsVersion : null,
    settings,
  }
}
