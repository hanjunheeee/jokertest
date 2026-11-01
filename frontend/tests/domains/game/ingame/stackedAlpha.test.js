import test from "node:test"
import assert from "node:assert/strict"
import { composeStackedAlpha } from "../../../../src/domains/game/ingame/utils/ingameStackedAlphaPlayback.js"

function colorPixels() {
  return new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255])
}

function maskOfBrightness(r, g, b) {
  return new Uint8ClampedArray([r, g, b, 255, r, g, b, 255])
}

test("마스크 밝기 0(검정)은 알파 0을 반환한다", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(0, 0, 0)
  const result = composeStackedAlpha(color, mask)
  assert.equal(result[3], 0)
  assert.equal(result[7], 0)
})

test("마스크 밝기 255(흰색)는 알파 255를 반환한다", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(255, 255, 255)
  const result = composeStackedAlpha(color, mask)
  assert.equal(result[3], 255)
  assert.equal(result[7], 255)
})

test("마스크 중간 밝기는 R·G·B 평균을 반올림한 알파를 반환한다", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(10, 20, 30)
  const result = composeStackedAlpha(color, mask)
  assert.equal(result[3], 20)

  const mask2 = maskOfBrightness(1, 1, 1)
  const result2 = composeStackedAlpha(color, mask2)
  assert.equal(result2[3], 1)
})

test("색 채널(RGB)은 color 입력 값을 그대로 보존한다", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(128, 128, 128)
  const result = composeStackedAlpha(color, mask)
  assert.equal(result[0], color[0])
  assert.equal(result[1], color[1])
  assert.equal(result[2], color[2])
  assert.equal(result[4], color[4])
  assert.equal(result[5], color[5])
  assert.equal(result[6], color[6])
})

test("입력 배열은 변경되지 않는다(불변성)", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(64, 64, 64)
  const colorSnapshot = Uint8ClampedArray.from(color)
  const maskSnapshot = Uint8ClampedArray.from(mask)
  composeStackedAlpha(color, mask)
  assert.deepEqual(color, colorSnapshot)
  assert.deepEqual(mask, maskSnapshot)
})

test("반환 배열은 입력과 독립된 새 배열이다", () => {
  const color = colorPixels()
  const mask = maskOfBrightness(255, 255, 255)
  const result = composeStackedAlpha(color, mask)
  assert.notEqual(result, color)
  assert.notEqual(result, mask)
  result[0] = 1
  assert.notEqual(color[0], 1)
})

test("길이가 다른 입력은 예외를 던진다", () => {
  const color = colorPixels()
  const shortMask = new Uint8ClampedArray([0, 0, 0, 255])
  assert.throws(() => composeStackedAlpha(color, shortMask))
})

test("4의 배수가 아닌 길이는 예외를 던진다", () => {
  const color = new Uint8ClampedArray([1, 2, 3])
  const mask = new Uint8ClampedArray([1, 2, 3])
  assert.throws(() => composeStackedAlpha(color, mask))
})
