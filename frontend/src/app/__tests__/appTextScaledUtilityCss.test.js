import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { compile } from "tailwindcss"

import {
  SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS,
  SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS,
} from "../../domains/user/constants/skinCardWear/skinCardWearLayout.js"

const INDEX_CSS_PATH = fileURLToPath(new URL("../index.css", import.meta.url))
const INDEX_CSS = readFileSync(INDEX_CSS_PATH, "utf8")

function appTextScaledDeclaration(css) {
  const utility = css.match(/@utility\s+app-text-scaled\s*\{[^}]*\}/)
  if (utility) return utility[0]

  const handWritten = css.match(/@layer\s+utilities\s*\{\s*\.app-text-scaled\s*\{[^}]*\}\s*\}/)
  if (handWritten) return handWritten[0]

  assert.fail("index.css에서 app-text-scaled 선언을 찾지 못했습니다")
}

async function buildCss(declaration, candidates) {
  const compiler = await compile(`@tailwind utilities;\n${declaration}\n`)
  return compiler.build(candidates)
}

function ruleTargetingDescendantParagraph(css) {
  const stack = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      stack.push({ selector: css.slice(start, i).trim(), body: i + 1 })
      start = i + 1
    } else if (css[i] === "}") {
      const rule = stack.pop()
      if (rule) {
        const selectors = [...stack.map(item => item.selector), rule.selector].join(" ")
        if (selectors.includes("app-text-scaled") && /(?:^|\s|&)p\s*\)?\s*$/.test(rule.selector)) {
          return css.slice(rule.body, i)
        }
      }
      start = i + 1
    }
  }
  return undefined
}

const SCALED_FONT_SIZE = /font-size:\s*calc\(\s*var\(--app-text-size[^)]*\)\s*\*\s*var\(--app-text-scale[^)]*\)\s*\)/

test("F-15(AC-02): app-text-scaled는 평범한 유틸리티로 방출된다(기존 소비자 보존)", async () => {
  const css = await buildCss(appTextScaledDeclaration(INDEX_CSS), ["app-text-scaled"])

  assert.match(css, /\.app-text-scaled\s*\{/, "평범한 클래스 규칙이 사라지면 모든 소비자가 깨진다")
  assert.match(css, SCALED_FONT_SIZE, "선언 본문(--app-text-size * --app-text-scale)이 보존되어야 한다")
})

test("F-15(AC-02): [&_p]:!app-text-scaled가 실제로 자손 p 규칙을 방출한다", async () => {
  const css = await buildCss(appTextScaledDeclaration(INDEX_CSS), ["[&_p]:!app-text-scaled"])

  const rule = ruleTargetingDescendantParagraph(css)
  assert.notEqual(
    rule,
    undefined,
    `자손 p 규칙이 없으면 스킨&카드 미리보기 명패는 배율을 받지 못한다 — 방출된 CSS: ${css}`,
  )
  assert.match(rule, SCALED_FONT_SIZE, "자손 p에 배율 font-size가 실려야 한다")
  assert.match(rule, /!important/, "명패 <p>의 고정 font-size를 덮으려면 important가 필요하다")
})

test("F-15(AC-02): 이전의 손수 @layer utilities 형태였다면 이 검사가 실패한다(부정 예)", async () => {
  const handWritten = `@layer utilities {\n  .app-text-scaled {\n    font-size: calc(var(--app-text-size, 1rem) * var(--app-text-scale, 1));\n  }\n}`
  const css = await buildCss(handWritten, ["[&_p]:!app-text-scaled"])

  assert.equal(
    ruleTargetingDescendantParagraph(css),
    undefined,
    "손수 클래스에 variant가 붙는다면 이 부정 예가 의미를 잃는다",
  )
})

test("F-15(AC-02): 스킨&카드 미리보기 명패 래퍼가 자손 p 규칙과 원래 크기를 함께 싣는다", () => {
  assert.ok(
    SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS.includes("[&_p]:!app-text-scaled"),
    "자손 p에 규칙을 걸지 않으면 명패는 인게임용 고정 크기를 쓴다",
  )
  assert.ok(
    SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS.includes(
      "[--app-text-size:clamp(1.05rem,8.5cqi,1.42rem)]",
    ),
    "F-15 이전 크기(clamp(1.05rem,8.5cqi,1.42rem))가 한 글자도 바뀌면 안 된다",
  )

  assert.ok(
    SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS.includes("[container-type:inline-size]"),
    "container가 없으면 8.5cqi가 다른 기준으로 계산돼 기하가 달라진다",
  )
  assert.ok(
    SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS.includes(SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS),
    "명패 규칙이 실제 래퍼 클래스에 붙어 있어야 한다",
  )
})

test("F-15(AC-02): 인게임 명패 자체는 일반 배율을 받지 않는다(경계 보존)", async () => {
  const { INGAME_PLAYER_NAMEPLATE_CLASS } = await import(
    "../../domains/game/ingame/constants/board/ingamePlayerAssets.js"
  )

  assert.ok(
    !INGAME_PLAYER_NAMEPLATE_CLASS.includes("app-text-scaled"),
    "인게임 텍스트는 일반 '텍스트 크기'에서 제외된다 — 미리보기 래퍼 안에서만 커진다",
  )
  assert.ok(
    INGAME_PLAYER_NAMEPLATE_CLASS.includes("text-[clamp(0.875rem,5.8cqi,1.1rem)]"),
    "인게임 명패의 원래 고정 크기가 보존되어야 한다",
  )
})
