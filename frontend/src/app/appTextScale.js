// 일반 설정 글자 크기(1~5단계)를 화면 글자 배율(0.7~1.3배)로 바꿔 css 변수에 넣음
// useAppTextScaleSync 훅이 씀 (배율 계산은 시험도 직접 부름)
import { GENERAL_SETTING_TEXT_SIZE } from "../domains/settings/constants/generalSettings.js"

// index.css 글자 크기 계산이 곱하는 변수
export const APP_TEXT_SCALE_CSS_VAR = "--app-text-scale"

// 가장 작은 단계·큰 단계의 배율
const APP_TEXT_SCALE_MIN = 0.7
const APP_TEXT_SCALE_MAX = 1.3

// 가운데 단계가 1배, 아래쪽·위쪽을 따로 나눠 0.7·1.3배까지 늘림
export function getAppTextScale(generalTextSize) {
  const { min, max, defaultValue } = GENERAL_SETTING_TEXT_SIZE
  const n = Number(generalTextSize)
  // 숫자가 아니면 기본 배율
  if (!Number.isFinite(n)) return 1

  // 설정 범위 밖 값은 끝값으로 자름
  const clamped = Math.min(max, Math.max(min, n))
  const center = defaultValue
  const belowCenter = center - min
  const aboveCenter = max - center

  // 기본값이 끝 단계면 나눌 수 없어 기본 배율
  if (belowCenter <= 0 || aboveCenter <= 0) return 1

  // 기본값 기준 -1~1 위치
  const offset =
    clamped <= center
      ? (clamped - center) / belowCenter
      : (clamped - center) / aboveCenter

  // 기본값보다 작으면 0.7 쪽, 크면 1.3 쪽
  if (offset < 0) {
    return 1 + offset * (1 - APP_TEXT_SCALE_MIN)
  }
  return 1 + offset * (APP_TEXT_SCALE_MAX - 1)
}

// html 뿌리에 넣어 화면 전체 글자가 같이 바뀜
export function syncAppTextScale(generalTextSize) {
  const scale = getAppTextScale(generalTextSize)
  document.documentElement.style.setProperty(APP_TEXT_SCALE_CSS_VAR, String(scale))
  return scale
}
