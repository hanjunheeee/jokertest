// 다음 게임 설정 저장 레코드 만들기·읽기 (저장소는 안 건드림)
// store/nextRoomSettings가 씀
import {
  ALLOWED_RECORD_KEYS,
  KEY_PREFIX,
  NEXT_ROOM_SETTINGS_SCHEMA_VERSION,
} from "../constants/nextRoomSettings.js"
import { sanitizeRestoreSource } from "./roomSettingsSourceSanitize.js"
import { isNonEmptyString, isPlainObject } from "../../shared/utils/valueChecks.js"

// 계정별 저장 키, 계정 id가 없으면 null
export function nextRoomSettingsStorageKey(accountId) {
  if (!isNonEmptyString(accountId)) return null
  return `${KEY_PREFIX}${encodeURIComponent(accountId)}`
}

// 유지 켬 레코드
export function buildRecord(accountId, source) {
  return {
    schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION,
    accountId,
    enabled: true,
    source,
  }
}

// 유지 끔 레코드 (지우기가 실패했을 때 대신 씀)
export function buildDisabledRecord(accountId) {
  return { schemaVersion: NEXT_ROOM_SETTINGS_SCHEMA_VERSION, accountId, enabled: false }
}

// 저장된 문자열 읽기: none / corrupted / disabled / enabled, dropped = 허용 밖 키를 버렸는지
export function parseRecord(raw, accountId) {
  if (raw === null || raw === undefined) return { kind: "none" }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: "corrupted" }
  }
  // 모양·버전·계정이 다르면 깨진 것
  if (!isPlainObject(parsed)) return { kind: "corrupted" }
  if (parsed.schemaVersion !== NEXT_ROOM_SETTINGS_SCHEMA_VERSION) return { kind: "corrupted" }
  if (parsed.accountId !== accountId) return { kind: "corrupted" }
  const recordDropped = Object.keys(parsed).some((key) => !ALLOWED_RECORD_KEYS.includes(key))
  if (parsed.enabled !== true) return { kind: "disabled", dropped: recordDropped }

  // 설정 원본 정리, 못 쓰는 값이면 깨진 것
  const sanitized = sanitizeRestoreSource(parsed.source)
  if (!sanitized.ok) return { kind: "corrupted" }
  return { kind: "enabled", source: sanitized.source, dropped: sanitized.dropped || recordDropped }
}
