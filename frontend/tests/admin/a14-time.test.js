// 관리자 화면 시각 시험: 서버 시각(UTC)을 화면에서만 한국 시각으로, 자정 경계·빈 값
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-033~035, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-time.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "./a14-kit.mjs"

const { formatKst } = await import("../../src/admin/shared/utils/time.js")

// 화면 모양은 "2026-11-15 23:59"(초 없음) — 날짜·시·분이 한국 시각인지 봄
test("A14-F-033 시각은 한국 시각: 2026-11-15T14:59:59Z → 11월 15일 23:59", () => {
  const text = formatKst("2026-11-15T14:59:59Z")
  assert.match(text, /2026-11-15/)
  assert.match(text, /23:59/)
})

test("A14-F-034 시각은 한국 시각: 2026-11-15T15:00:00Z → 11월 16일 00:00 (자정 넘음)", () => {
  const text = formatKst("2026-11-15T15:00:00Z")
  assert.match(text, /2026-11-16/)
  assert.match(text, /00:00/)
})

test("A14-F-035 시각은 한국 시각: null → 빈 표시(숫자 없음)", () => {
  const text = formatKst(null)
  assert.equal(/\d/.test(text), false)
  assert.ok(text.length <= 1, `빈 표시가 아님: ${text}`)
})
