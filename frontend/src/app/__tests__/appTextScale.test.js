import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"

import { GENERAL_SETTING_TEXT_SIZE } from "../../domains/settings/constants/generalSettings.js"
import { APP_TEXT_SCALE_CSS_VAR, getAppTextScale, syncAppTextScale } from "../appTextScale.js"

const dom = new JSDOM("<!doctype html><html><body></body></html>")
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
  writable: true,
})

// F-15(AC-02): "텍스트 크기" 설정(1~5, 기본값 3)의 실제 소비자 — App.jsx가 이 함수로
// GENERAL_SETTING_TEXT_SIZE 값을 --app-text-scale에 반영한다.
test("getAppTextScale: 기본값(3)은 배율 1이다 — 저장한 적 없으면 기존 화면과 같아야 한다", () => {
  assert.equal(getAppTextScale(GENERAL_SETTING_TEXT_SIZE.defaultValue), 1)
})

test("getAppTextScale: 최솟값·최댓값은 좁은 범위(0.85~1.15) 안에서 대칭이다", () => {
  const atMin = getAppTextScale(GENERAL_SETTING_TEXT_SIZE.min)
  const atMax = getAppTextScale(GENERAL_SETTING_TEXT_SIZE.max)

  assert.ok(atMin >= 0.85 && atMin < 1)
  assert.ok(atMax <= 1.15 && atMax > 1)
  assert.ok(Math.abs(1 - atMin - (atMax - 1)) < 1e-9, "기본값 기준으로 대칭이어야 한다")
})

test("getAppTextScale: 값이 클수록 배율도 단조 증가한다", () => {
  const scales = []
  for (let n = GENERAL_SETTING_TEXT_SIZE.min; n <= GENERAL_SETTING_TEXT_SIZE.max; n += 1) {
    scales.push(getAppTextScale(n))
  }
  for (let i = 1; i < scales.length; i += 1) {
    assert.ok(scales[i] > scales[i - 1])
  }
})

test("getAppTextScale: 범위를 벗어나면 clamp하고, 숫자가 아니면 1(기본)로 대체한다", () => {
  assert.equal(getAppTextScale(999), getAppTextScale(GENERAL_SETTING_TEXT_SIZE.max))
  assert.equal(getAppTextScale(-10), getAppTextScale(GENERAL_SETTING_TEXT_SIZE.min))
  assert.equal(getAppTextScale(Number.NaN), 1)
  assert.equal(getAppTextScale(undefined), 1)
})

test("syncAppTextScale: document.documentElement에 --app-text-scale을 반영한다", () => {
  const scale = syncAppTextScale(GENERAL_SETTING_TEXT_SIZE.max)

  assert.ok(scale > 1)
  assert.equal(
    document.documentElement.style.getPropertyValue(APP_TEXT_SCALE_CSS_VAR),
    String(scale),
  )
})

test("syncAppTextScale: generalTextSize가 바뀔 때마다 값을 다시 반영한다", () => {
  syncAppTextScale(GENERAL_SETTING_TEXT_SIZE.min)
  const afterMin = document.documentElement.style.getPropertyValue(APP_TEXT_SCALE_CSS_VAR)

  syncAppTextScale(GENERAL_SETTING_TEXT_SIZE.max)
  const afterMax = document.documentElement.style.getPropertyValue(APP_TEXT_SCALE_CSS_VAR)

  assert.notEqual(afterMin, afterMax)
})
