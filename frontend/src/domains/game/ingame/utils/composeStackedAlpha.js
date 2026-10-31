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
