// 파일 역할: appTextScale.js - GENERAL_SETTING_TEXT_SIZE(설정 화면 "텍스트 크기")를 실제
// 화면에 적용할 CSS 배율로 바꾸는 순수 함수 + document 반영 helper입니다.
import { GENERAL_SETTING_TEXT_SIZE } from "../domains/settings/constants/generalSettings.js"

/** index.css의 body 기본 font-size와 각 화면의 font-size 선언이 곱하는 CSS 변수 이름 */
export const APP_TEXT_SCALE_CSS_VAR = "--app-text-scale"

const APP_TEXT_SCALE_MIN = 0.85
const APP_TEXT_SCALE_MAX = 1.15

/**
 * F-15(AC-02): GENERAL_SETTING_TEXT_SIZE(1~5)를 실제 폰트 배율로 바꾼다. min·max
 * 범위의 정중앙(기본값 3)이 배율 1이 되도록 대칭 구성해서, 저장한 적 없는 사용자에게는
 * 기존 화면과 시각적 차이가 없다. 배율 범위를 0.85~1.15로 좁게 제한해 텍스트 크기 조절이
 * rem 단위를 함께 쓰는 레이아웃 간격까지 흔드는 "전체 화면 확대"가 되지 않게 한다 —
 * 이 배율은 font-size 선언에만 곱해지고(index.css의 body 기본값 + 자체 font-size를
 * 지정하는 요소의 calc 선언), 간격·프레임 크기에는 관여하지 않는다.
 * @param {number} generalTextSize
 * @returns {number}
 */
export function getAppTextScale(generalTextSize) {
  const { min, max } = GENERAL_SETTING_TEXT_SIZE
  const n = Number(generalTextSize)
  if (!Number.isFinite(n)) return 1

  const clamped = Math.min(max, Math.max(min, n))
  const ratio = (clamped - min) / (max - min)
  return APP_TEXT_SCALE_MIN + (APP_TEXT_SCALE_MAX - APP_TEXT_SCALE_MIN) * ratio
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
