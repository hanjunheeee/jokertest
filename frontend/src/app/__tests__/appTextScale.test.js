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

// ── 화면 전체 확대 금지 검사 ────────────────────────────────────────────────
//
// html·:root의 font-size를 배율에 묶거나 zoom을 쓰면 rem 기반 간격·프레임까지 함께
// 움직여 "텍스트 크기"가 아니라 화면 전체 확대가 된다. 이전 구현의 검사는 소스를 통째로
// 정규식에 물려서 **주석 안의 "html"** 에서 시작해 그 다음 실제 규칙(.app-text-scaled)의
// font-size까지 한 덩어리로 읽어 잘못 걸렸다. 그래서 주석을 먼저 걷어내고 규칙의
// 선택자·선언을 실제로 갈라 본다.

/** CSS 주석을 걷어낸다 — 주석 속 설명 문구가 규칙으로 오인되지 않게 한다. */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * `{ selector, declarations }` 목록으로 쪼갠다. 중첩 블록(@layer·@theme 안의 규칙)도 각각
 * 하나의 규칙으로 펼치고, 각 규칙의 declarations에는 그 블록이 "직접" 가진 선언만 담는다
 * (중첩 규칙의 선언이 바깥 규칙의 것으로 섞이지 않는다).
 */
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
      // 블록 안이면 그 블록의 선언으로, 최상위면(@import 등) 버린다 — 어느 쪽이든
      // 다음 규칙의 선택자에 앞 문장이 섞이지 않게 여기서 끊는다.
      if (stack.length > 0) stack[stack.length - 1].declarations += buffer
      buffer = ""
    }
  }

  return rules
}

/** `html`·`:root` 자체(의사 클래스가 붙은 형태 포함)를 가리키는 선택자인지. */
const ROOT_COMPOUND = /^(?:html|:root)(?::[a-z-]+(?:\([^)]*\))?)*$/i

function targetsRootElement(selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      // 자손·자식 결합자로 끊어 마지막 compound만 본다 — `html:fullscreen body`가
      // 가리키는 것은 body이지 root가 아니다.
      const compounds = part.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
      return ROOT_COMPOUND.test(compounds[compounds.length - 1])
    })
}

/** 선언 블록에서 `prop: value` 쌍을 뽑는다(@apply 같은 at-rule은 값 검사 대상이 아니다). */
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

/**
 * 금지 사항을 어긴 선언 목록을 돌려준다.
 *   (1) html·:root 자체의 font-size를 --app-text-* 변수에 묶는 것
 *   (2) 어디서든 zoom을 --app-text-* 변수에 묶는 것(화면 전체 확대)
 *   (3) html·:root에 zoom을 거는 것
 */
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
  // 통과만 하는 검사는 아무것도 고정하지 못한다 — 금지된 형태를 직접 넣어 걸리는지 본다.
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

  // 반대로 지금의 구현 형태는 걸리지 않아야 한다.
  const allowed = [
    // 주석이 html을 언급해도 그 뒤의 실제 규칙과 이어 읽지 않는다(이 검사의 원래 결함).
    "/* html/:root의 font-size는 건드리지 않는다 */\n" +
      ".app-text-scaled { font-size: calc(var(--app-text-size, 1rem) * var(--app-text-scale, 1)); }",
    "body { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    // html에 붙지만 실제로 크기를 받는 요소는 자손이다.
    "html:fullscreen body { font-size: calc(1rem * var(--app-text-scale, 1)); }",
    "html, body { background: black; }",
  ]
  for (const css of allowed) {
    assert.deepEqual(findWholeScreenZoomViolations(css), [], `잘못 걸린 형태: ${css}`)
  }
})
