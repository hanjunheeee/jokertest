// AD-044 목록 부품 시험: 768px 이상이면 표, 아래면 카드, 폭이 바뀌면 바로 바뀜
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, act, screen } = await import("@testing-library/react")
const { default: DataList } = await import("../../../src/admin/shared/ui/DataList.jsx")

test.afterEach(() => cleanup())

const columns = [
  { key: "nickname", label: "닉네임" },
  { key: "status", label: "상태", render: (row) => (row.banned ? "정지" : "보통") },
]
const rows = [
  { id: 1, nickname: "가면1", banned: false },
  { id: 2, nickname: "가면2", banned: true },
]

const draw = (props) => render(React.createElement(DataList, { columns, rows, empty: "찾은 회원이 없어요.", ...props }))

test("AD-044 768px 이상은 표 (머리 칸·줄)", () => {
  setScreenWidth(768)
  draw()
  assert.ok(screen.getByRole("table"))
  assert.equal(screen.getAllByRole("columnheader").length, 2)
  assert.equal(screen.getAllByRole("row").length, 3)
  assert.ok(screen.getByText("정지"))
})

test("AD-044 767px 이하는 카드 (줄마다 이름표:값)", () => {
  setScreenWidth(375)
  draw()
  assert.equal(screen.queryByRole("table"), null)
  const cards = screen.getAllByRole("listitem")
  assert.equal(cards.length, 2)
  assert.match(cards[1].textContent, /닉네임.*가면2/)
  assert.match(cards[1].textContent, /상태.*정지/)
})

test("AD-044 카드 모양을 따로 주면 그걸 씀", () => {
  setScreenWidth(375)
  draw({ renderCard: (row) => React.createElement("strong", null, `카드 ${row.nickname}`) })
  assert.ok(screen.getByText("카드 가면1"))
})

test("AD-044 폭이 바뀌면 표 ↔ 카드", () => {
  setScreenWidth(1280)
  draw()
  assert.ok(screen.getByRole("table"))
  act(() => setScreenWidth(375))
  assert.equal(screen.queryByRole("table"), null)
})

test("AD-044 빈 목록은 할 일 문구", () => {
  setScreenWidth(1280)
  draw({ rows: [] })
  assert.ok(screen.getByText("찾은 회원이 없어요."))
  assert.equal(screen.queryByRole("table"), null)
})
