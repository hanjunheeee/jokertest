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

test("getAppTextScale: 기본값(3)은 배율 1이다 — 저장한 적 없으면 기존 화면과 같아야 한다", () => {
  assert.equal(getAppTextScale(GENERAL_SETTING_TEXT_SIZE.defaultValue), 1)
})

test("getAppTextScale: 최솟값·최댓값은 0.7~1.3 범위 안에서 대칭이다", () => {
  const atMin = getAppTextScale(GENERAL_SETTING_TEXT_SIZE.min)
  const atMax = getAppTextScale(GENERAL_SETTING_TEXT_SIZE.max)

  assert.ok(atMin >= 0.7 && atMin < 1)
  assert.ok(atMax <= 1.3 && atMax > 1)
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
  assert.ok(
    !/^\s*\.app-text-scalable\s*\{/m.test(indexCss),
    "적용되지 않는 규칙을 남겨두면 배율이 반영되는 것처럼 오해된다",
  )
})

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

function parseCssRules(css) {
  const rules = []
  const stack = []
  let buffer = ""

  for (const char of css) {
    if (char === "{") {
      stack.push({ selector: buffer.trim(), declarations: "" })
      buffer = ""
      continue
    }
    if (char === "}") {
      const rule = stack.pop()
      if (!rule) continue
      rule.declarations += buffer
      buffer = ""
      rules.push(rule)
      continue
    }

    buffer += char
    if (char === ";") {
      if (stack.length > 0) stack[stack.length - 1].declarations += buffer
      buffer = ""
    }
  }

  return rules
}

const ROOT_COMPOUND = /^(?:html|:root)(?::[a-z-]+(?:\([^)]*\))?)*$/i

function targetsRootElement(selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const compounds = part.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
      return ROOT_COMPOUND.test(compounds[compounds.length - 1])
    })
}

function declarationsOf(block) {
  return block
    .split(";")
    .map((piece) => piece.trim())
    .filter((piece) => piece && !piece.startsWith("@") && piece.includes(":"))
    .map((piece) => {
      const colon = piece.indexOf(":")
      return { property: piece.slice(0, colon).trim().toLowerCase(), value: piece.slice(colon + 1) }
    })
    .filter(({ property }) => property)
}

function findWholeScreenZoomViolations(css) {
  const violations = []

  for (const { selector, declarations } of parseCssRules(stripCssComments(css))) {
    const isRoot = targetsRootElement(selector)

    for (const { property, value } of declarationsOf(declarations)) {
      const scaledByAppTextVar = value.includes("--app-text")

      if (property === "zoom" && (isRoot || scaledByAppTextVar)) {
        violations.push(`${selector} { ${property}:${value} }`)
        continue
      }
      if (property === "font-size" && isRoot && scaledByAppTextVar) {
        violations.push(`${selector} { ${property}:${value} }`)
      }
    }
  }

  return violations
}

test("index.css: 배율이 레이아웃 간격까지 확대하는 화면 전체 zoom이 아니다", () => {
  assert.deepEqual(
    findWholeScreenZoomViolations(indexCss),
    [],
    "html·:root의 font-size를 배율로 바꾸거나 zoom을 쓰면 rem 기반 레이아웃 전체가 확대된다",
  )
})

test("index.css: 화면 전체 확대 검사가 실제 금지 코드를 잡아낸다(검사 자체의 회귀 방지)", () => {
  const forbidden = [
    "html { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    ":root { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    "html:fullscreen { font-size: calc(16px * var(--app-text-scale)); }",
    "body { zoom: var(--app-text-scale, 1); }",
    "html { zoom: 1.1; }",
    "@layer base { html { font-size: calc(1rem * var(--app-text-scale, 1)); } }",
  ]
  for (const css of forbidden) {
    assert.equal(
      findWholeScreenZoomViolations(css).length,
      1,
      `금지된 선언을 잡지 못했다: ${css}`,
    )
  }

  const allowed = [
    "/* html/:root의 font-size는 건드리지 않는다 */\n" +
      ".app-text-scaled { font-size: calc(var(--app-text-size, 1rem) * var(--app-text-scale, 1)); }",
    "body { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    "html:fullscreen body { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    "html, body { background: black; }",
  ]
  for (const css of allowed) {
    assert.deepEqual(findWholeScreenZoomViolations(css), [], `잘못 걸린 형태: ${css}`)
  }
})
