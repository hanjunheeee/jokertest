// 2-5 금지어 화면 시험: 목록·넣기·이미 있음 글귀·끄기 뒤 서버(Node)별 반영 결과
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act } = await import("@testing-library/react")
const { default: BannedWordsPage } = await import("../../../src/admin/domains/bannedWords/pages/BannedWordsPage.jsx")

test.afterEach(() => cleanup())

const ROW = { id: 3, word: "나쁜말", isActive: true, createdAt: "2026-11-10T03:00:00.000Z", updatedAt: "2026-11-10T03:00:00.000Z" }

const open = async () => {
  await act(async () => { render(React.createElement(BannedWordsPage)) })
}

test("금지어 목록이 보이고 빈 목록이면 할 일 문구", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/banned-words", 200, { ok: true, items: [], nextBefore: null })
  await open()
  assert.ok(screen.getByText("아직 금지어가 없어요. 위 칸에 넣어 주세요."))
})

test("넣기 → 목록 새로 고침 + 반영 결과", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let added = false
  server.answerWith("GET /admin-api/banned-words", () => ({ status: 200, body: { ok: true, items: added ? [ROW] : [], nextBefore: null } }))
  server.answerWith("POST /admin-api/banned-words", () => {
    added = true
    return { status: 201, body: { ok: true, word: ROW, nodes: [{ node: "n1", ok: true }], partial: false } }
  })
  await open()
  fireEvent.change(screen.getByLabelText("넣을 금지어"), { target: { value: " 나쁜말 " } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "넣기" })) })

  const post = server.calls.find((call) => call.method === "POST")
  assert.deepEqual(JSON.parse(post.body), { word: "나쁜말" })
  assert.ok(screen.getByText("n1 반영됨"))
  assert.ok(screen.getByRole("cell", { name: "나쁜말" }))
})

test("이미 있는 꺼진 단어 → 켜 달라는 글귀", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/banned-words", 200, { ok: true, items: [], nextBefore: null })
  server.answer("POST /admin-api/banned-words", 409, { ok: false, code: "BANNED_WORD_EXISTS", message: "x", id: 3, isActive: false })
  await open()
  fireEvent.change(screen.getByLabelText("넣을 금지어"), { target: { value: "나쁜말" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "넣기" })) })
  assert.ok(screen.getByText("이미 있는 단어예요. 꺼져 있으니 목록에서 켜 주세요."))
})

test("끄기 → n2 반영 안 됨 표시", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer("GET /admin-api/banned-words", 200, { ok: true, items: [ROW], nextBefore: null })
  server.answer("PATCH /admin-api/banned-words/3", 200, {
    ok: true, word: { ...ROW, isActive: false }, nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }], partial: true,
  })
  await open()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "나쁜말 끄기" })) })

  const patch = server.calls.find((call) => call.method === "PATCH")
  assert.deepEqual(JSON.parse(patch.body), { isActive: false })
  assert.ok(screen.getByText("n2 반영 안 됨"))
  assert.ok(screen.getByText("반영 안 된 서버도 1분 안에 스스로 다시 읽어요."))
})
