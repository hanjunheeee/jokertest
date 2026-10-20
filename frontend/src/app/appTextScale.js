// 파일 역할: appTextScale.js - GENERAL_SETTING_TEXT_SIZE(설정 화면 "텍스트 크기")를 실제
// 화면에 적용할 CSS 배율로 바꾸는 순수 함수 + document 반영 helper입니다.
import { GENERAL_SETTING_TEXT_SIZE } from "../domains/settings/constants/generalSettings.js"

/** index.css의 body 기본 font-size와 각 화면의 font-size 선언이 곱하는 CSS 변수 이름 */
export const APP_TEXT_SCALE_CSS_VAR = "--app-text-scale"

const APP_TEXT_SCALE_MIN = 0.7
const APP_TEXT_SCALE_MAX = 1.3

/**
 * F-15(AC-02): GENERAL_SETTING_TEXT_SIZE(1~5)를 실제 폰트 배율로 바꾼다. min·max
 * 범위의 정중앙(기본값 3)이 배율 1이 되도록 대칭 구성해서, 저장한 적 없는 사용자에게는
 * 기존 화면과 시각적 차이가 없다. 배율 범위는 0.7~1.3(±30%)으로 font-size에만 곱해지며
 * (index.css의 body 기본값 + app-text-scaled 선언), 간격·프레임 크기에는 관여하지 않는다.
 * @param {number} generalTextSize
 * @returns {number}
 */
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

/**
 * App.jsx의 useEffect가 generalTextSize가 바뀔 때마다 호출한다 — document.documentElement에
 * --app-text-scale을 반영해 이 변수를 곱해 쓰는 모든 font-size가 즉시 새 배율을 따르게 한다.
 * @param {number} generalTextSize
 * @returns {number} 실제로 반영한 배율(시험 편의용 반환값)
 */
export function syncAppTextScale(generalTextSize) {
  const scale = getAppTextScale(generalTextSize)
  document.documentElement.style.setProperty(APP_TEXT_SCALE_CSS_VAR, String(scale))
  return scale
}
