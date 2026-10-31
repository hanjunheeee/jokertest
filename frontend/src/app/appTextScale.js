import { GENERAL_SETTING_TEXT_SIZE } from "../domains/settings/constants/generalSettings.js"

export const APP_TEXT_SCALE_CSS_VAR = "--app-text-scale"

const APP_TEXT_SCALE_MIN = 0.7
const APP_TEXT_SCALE_MAX = 1.3

export function getAppTextScale(generalTextSize) {
  const { min, max, defaultValue } = GENERAL_SETTING_TEXT_SIZE
  const n = Number(generalTextSize)
  if (!Number.isFinite(n)) return 1

  const clamped = Math.min(max, Math.max(min, n))
  const center = defaultValue
  const belowCenter = center - min
  const aboveCenter = max - center

  if (belowCenter <= 0 || aboveCenter <= 0) return 1

  const offset =
    clamped <= center
      ? (clamped - center) / belowCenter
      : (clamped - center) / aboveCenter

  if (offset < 0) {
    return 1 + offset * (1 - APP_TEXT_SCALE_MIN)
  }
  return 1 + offset * (APP_TEXT_SCALE_MAX - 1)
}

export function syncAppTextScale(generalTextSize) {
  const scale = getAppTextScale(generalTextSize)
  document.documentElement.style.setProperty(APP_TEXT_SCALE_CSS_VAR, String(scale))
  return scale
}
