// 관리자 금지어 화면 시험: 이미 있는 단어 넣으면 "이미 있음" 글, 빈 단어면 넣기 꺼짐
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-091~092, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-banned-words.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, cleanup, type, press, settle, buttonNamed, callsOf, createFakeServer } from "./a14-kit.mjs"

const { default: BannedWordsPage } = await import("../../src/admin/domains/bannedWords/pages/BannedWordsPage.jsx")

test.afterEach(() => cleanup())

async function openPage() {
  const server = createFakeServer()
  server.answer("GET /admin-api/banned-words", 200, { ok: true, items: [{ id: 1, word: "나쁜말", isActive: true, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }], nextBefore: null })
  render(h(BannedWordsPage))
  await settle()
  return server
}
const wordField = () => screen.getByLabelText("넣을 금지어")

test("A14-F-091 금지어 화면: 409 BANNED_WORD_EXISTS → \"이미 있음\" 글", async () => {
  const server = await openPage()
  server.answer("POST /admin-api/banned-words", 409, {
    ok: false, code: "BANNED_WORD_EXISTS", message: "이미 있는 금지어예요. 꺼져 있으면 목록에서 다시 켜 주세요.", id: 1, isActive: true,
  })
  await type(wordField(), "나쁜말")
  await press(buttonNamed("넣기"))
  // 칸 옆 오류 글 (칸과 이어짐)
  const errorId = (wordField().getAttribute("aria-describedby") ?? "").split(" ").find((id) => id.endsWith("-error"))
  assert.ok(errorId, "칸 오류 글이 없음")
  assert.match(document.getElementById(errorId).textContent, /이미 있/)
  assert.equal(callsOf(server, "POST", "/admin-api/banned-words").length, 1)
})

test("A14-F-092 금지어 화면: 빈 단어 → 넣기 꺼짐", async () => {
  const server = await openPage()
  assert.equal(buttonNamed("넣기").disabled, true)
  await type(wordField(), "   ")
  assert.equal(buttonNamed("넣기").disabled, true)
  await press(buttonNamed("넣기"))
  assert.equal(callsOf(server, "POST", "/admin-api/banned-words").length, 0)
})
