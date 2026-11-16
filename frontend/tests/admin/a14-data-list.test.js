// 관리자 목록 부품 시험: 넓으면 표·좁으면 카드(768px 경계), 빈 목록 글, 불러오는 중·빈 목록·오류 세 상태
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-036~039, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-data-list.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, cleanup, act, setScreenWidth } from "./a14-kit.mjs"

const { default: DataList } = await import("../../src/admin/shared/ui/DataList.jsx")
const { default: StatusNote } = await import("../../src/admin/shared/ui/StatusNote.jsx")

test.afterEach(() => {
  cleanup()
  setScreenWidth(1280)
})

const COLUMNS = [{ key: "nickname", label: "닉네임" }, { key: "status", label: "상태" }]
const ROWS = [{ id: 1, nickname: "가면1", status: "보통" }, { id: 2, nickname: "가면2", status: "정지" }]

const drawAt = (width, rows = ROWS) => {
  setScreenWidth(width)
  render(h(DataList, { columns: COLUMNS, rows, caption: "회원 목록", empty: "없음 — 찾은 회원이 없어요." }))
}

test("A14-F-036 넓으면 표: 너비 768 → 표(줄 2개), 카드 없음", () => {
  drawAt(768)
  assert.equal(document.querySelectorAll("table tbody tr").length, 2)
  assert.equal(document.querySelectorAll("ul > li").length, 0)
})

test("A14-F-037 좁으면 카드: 너비 767 → 카드 2장, 표 없음 + 폭 바뀌면 바로 표로", async () => {
  drawAt(767)
  assert.equal(document.querySelectorAll("table").length, 0)
  const cards = [...document.querySelectorAll("ul > li")]
  assert.equal(cards.length, 2)
  assert.match(cards[0].textContent, /닉네임가면1/)
  await act(async () => { setScreenWidth(1024) })
  assert.equal(document.querySelectorAll("table tbody tr").length, 2)
})

test("A14-F-038 빈 목록 → 빈 글", () => {
  drawAt(1280, [])
  assert.match(document.body.textContent, /없음 — 찾은 회원이 없어요\./)
  assert.equal(document.querySelectorAll("table").length, 0)
})

test("A14-F-039 상태 셋: 불러오는 중 / 빈 목록 / 오류 → 세 글이 각각 보임", () => {
  render(h("div", null,
    h(StatusNote, { state: "loading" }),
    h(StatusNote, { state: "empty" }, "아직 보여 줄 줄이 없어요."),
    h(StatusNote, { state: "error", error: { code: "ADMIN_BUSY", message: "" }, onRetry: () => {} }),
  ))
  const text = document.body.textContent
  assert.match(text, /불러오는 중…/)
  assert.match(text, /아직 보여 줄 줄이 없어요\./)
  assert.match(text, /다른 조회가 밀려 있어요\./)
  // 오류엔 다시 불러오기 단추
  assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent === "다시 불러오기"), "다시 불러오기 없음")
})
