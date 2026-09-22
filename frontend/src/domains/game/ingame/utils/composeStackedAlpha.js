// 파일 역할: composeStackedAlpha.js - stacked MP4(위 절반 색, 아래 절반 마스크) 프레임에서
// 색 픽셀과 마스크 픽셀을 받아 알파가 채워진 RGBA 픽셀 배열을 순수하게 계산한다. DOM·canvas는
// 이 파일에 없다 — 호출부(InGameNightSuccessKillVideo)가 video 프레임을 읽어 넘긴다.

/**
 * F-27d(AC-02): color·mask 두 RGBA 픽셀 배열을 합성해 알파가 채워진 새 RGBA 배열을 돌려준다.
 *
 * 마스크의 밝기(R+G+B 평균, 반올림)를 알파로 쓴다 — 검정(0,0,0)은 알파 0(완전 투명), 흰색
 * (255,255,255)은 알파 255(완전 불투명)다. RGB 채널은 color 배열 값을 그대로 보존하고, 두
 * 입력 배열은 건드리지 않는다(항상 새 배열을 반환한다).
 *
 * @param {Uint8ClampedArray} colorPixels
 * @param {Uint8ClampedArray} maskPixels
 * @returns {Uint8ClampedArray}
 */
export function composeStackedAlpha(colorPixels, maskPixels) {
  if (colorPixels === null || maskPixels === null || colorPixels === undefined || maskPixels === undefined) {
    throw new TypeError("composeStackedAlpha: colorPixels와 maskPixels는 모두 있어야 한다")
  }
  if (colorPixels.length !== maskPixels.length) {
    throw new RangeError("composeStackedAlpha: colorPixels와 maskPixels의 길이가 같아야 한다")
  }
  if (colorPixels.length % 4 !== 0) {
    throw new RangeError("composeStackedAlpha: 픽셀 배열 길이는 4(RGBA)의 배수여야 한다")
  }

  const result = new Uint8ClampedArray(colorPixels.length)
  for (let i = 0; i < colorPixels.length; i += 4) {
    result[i] = colorPixels[i]
    result[i + 1] = colorPixels[i + 1]
    result[i + 2] = colorPixels[i + 2]
    result[i + 3] = Math.round((maskPixels[i] + maskPixels[i + 1] + maskPixels[i + 2]) / 3)
  }
  return result
}
