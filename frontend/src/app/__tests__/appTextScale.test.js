import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
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

// F-15(AC-02): 배율이 실제 화면에 닿는 지점은 index.css다. 여기서 두 가지를 확인한다.
//   (1) 스스로 font-size를 지정하지 않고 상속받는 본문 텍스트 전체가 배율을 따른다
//       (body의 font-size 선언) — 특정 화면에만 손으로 클래스를 단 경우가 아니다.
//   (2) 기본 배율에서 기존 크기가 그대로 보존된다 — 기준이 1rem이라 calc(1rem*1) = 1rem
//       = 브라우저 기본값이고, 1em(부모 기준)처럼 크기를 바꿔버리지 않는다.
const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8")

test("index.css: body의 font-size가 1rem 기준으로 --app-text-scale을 곱한다(기본값 보존)", () => {
  assert.match(
    indexCss,
    /font-size:\s*calc\(1rem\s*\*\s*var\(--app-text-scale,\s*1\)\)/,
    "상속 본문 텍스트 전체가 배율을 받는 선언이 있어야 한다",
  )
})

test("index.css: 배율 변수 기본값 1이 선언되어 있다", () => {
  assert.match(indexCss, /--app-text-scale:\s*1;/)
})

test("index.css: 유틸리티에 밀리던 .app-text-scalable 규칙은 남아 있지 않다", () => {
  // @layer components의 이 규칙은 같은 요소의 Tailwind font-size 유틸리티(@layer
  // utilities)에 밀려 적용되지 않았고, 1em 기준이라 적용되더라도 기존 크기를 바꿨다.
  // 주석의 언급은 허용하고(왜 안 쓰는지 남겨둔다) 실제 규칙 선언만 막는다.
  assert.ok(
    !/^\s*\.app-text-scalable\s*\{/m.test(indexCss),
    "적용되지 않는 규칙을 남겨두면 배율이 반영되는 것처럼 오해된다",
  )
})

test("index.css: 배율이 레이아웃 간격까지 확대하는 화면 전체 zoom이 아니다", () => {
  // html 요소의 font-size나 zoom을 건드리면 rem 기반 간격·프레임이 함께 움직인다.
  assert.ok(!/\bzoom:\s*var\(--app-text-scale/.test(indexCss))
  assert.ok(
    !/html[^{]*\{[^}]*font-size:\s*calc\([^}]*--app-text-scale/s.test(indexCss),
    "html의 font-size를 배율로 바꾸면 rem 기반 레이아웃 전체가 확대된다",
  )
})
