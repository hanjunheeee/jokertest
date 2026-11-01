// 기기에 저장된 설정값 정리·합치기 (깨진 값·범위 밖 값 걸러냄)
// 설정 스토어 persist의 merge가 씀
import { SOUND_SETTING_VOLUMES } from "../constants/soundSettings.js"
import { GENERAL_SETTING_TEXT_SIZE } from "../constants/generalSettings.js"
import { CHAT_CHECK_STORAGE_IDS, CHAT_TEXT_SIZE_STORAGE_RANGE } from "../constants/settingsStorage.js"
import { defaultGeneralChecks } from "./settingsDefaults.js"

// 저장해도 되는 키 목록: 이 밖의 키는 저장값에 있어도 버림
export const GENERAL_CHECK_STORAGE_IDS = new Set(Object.keys(defaultGeneralChecks()))
const CHAT_CHECK_ID_SET = new Set(CHAT_CHECK_STORAGE_IDS)

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

// 숫자가 아니면 fallback, 숫자면 범위 안으로 맞춤
export function clampNumber(value, { min, max, fallback }) {
  if (!isFiniteNumber(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

// 지금 음량을 바탕으로, 저장값 중 아는 id만 범위 안으로 맞춰 덮음
export function sanitizeVolumes(value, currentVolumes) {
  const base = {}
  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    base[id] = isFiniteNumber(currentVolumes?.[id]) ? currentVolumes[id] : defaultValue
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) return base

  const next = { ...base }
  for (const { id, min, max } of SOUND_SETTING_VOLUMES) {
    if (!Object.hasOwn(value, id)) continue
    next[id] = clampNumber(value[id], { min, max, fallback: base[id] })
  }
  return next
}

// 허용 id의 boolean 값만 남김, 객체가 아니면 null
function sanitizeBooleanMap(value, allowedIds) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null

  const next = {}
  for (const id of allowedIds) {
    if (!Object.hasOwn(value, id)) continue
    const checked = value[id]
    if (typeof checked === "boolean") next[id] = checked
  }
  return next
}

// 저장값을 지금 상태 위에 항목별로 걸러 덮음
export function mergePersistedSettings(persisted, current) {
  if (typeof persisted !== "object" || persisted === null) return current

  const volumes = sanitizeVolumes(persisted.volumes, current.volumes)

  // 일반 체크는 저장된 것만 덮고 나머지는 기본값 유지
  const restoredChecks = sanitizeBooleanMap(
    persisted.generalChecks,
    GENERAL_CHECK_STORAGE_IDS,
  )
  const generalChecks =
    restoredChecks !== null
      ? { ...current.generalChecks, ...restoredChecks }
      : current.generalChecks

  const generalTextSize = clampNumber(persisted.generalTextSize, {
    min: GENERAL_SETTING_TEXT_SIZE.min,
    max: GENERAL_SETTING_TEXT_SIZE.max,
    fallback: current.generalTextSize,
  })

  const chatChecks = sanitizeBooleanMap(persisted.chatChecks, CHAT_CHECK_ID_SET)

  const sfxMuted = typeof persisted.sfxMuted === "boolean" ? persisted.sfxMuted : current.sfxMuted

  const chatTextSize = clampNumber(persisted.chatTextSize, {
    ...CHAT_TEXT_SIZE_STORAGE_RANGE,
    fallback: current.chatTextSize,
  })

  return { ...current, volumes, generalChecks, generalTextSize, chatChecks, chatTextSize, sfxMuted }
}
