// 2-7 상품 화면 시험: 목록(값·받는 양·판매·판), 고치기 → 화면이 본 판 번호로 보냄, 규칙 어긴 칸 표시, 남이 먼저 고침 안내, 새 상품
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act } = await import("@testing-library/react")
const { default: ProductsPage } = await import("../../../src/admin/domains/products/pages/ProductsPage.jsx")

test.afterEach(() => cleanup())

const PRODUCT = {
  productId: "diamond-110", kind: "DIAMOND_TOPUP", displayName: "다이아 110개", payCurrency: "KRW", payAmount: 1100,
  grantCurrency: "DIAMOND", grantAmount: 100, bonusAmount: 10, status: "ON_SALE", sortOrder: 1, version: 1, valid: true,
}

const open = async () => {
  await act(async () => { render(React.createElement(ProductsPage)) })
}

const save = async () => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "저장" })) })
}

test("AD-194 목록: 값·받는 양(덤)·판매·판", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/products", 200, { ok: true, items: [PRODUCT, { ...PRODUCT, productId: "gold-500", kind: "GOLD_PURCHASE", displayName: "골드 500", payCurrency: "DIAMOND", payAmount: 30, grantCurrency: "GOLD", grantAmount: 500, bonusAmount: 0, status: "STOPPED", valid: false }] })
  await open()
  assert.ok(screen.getByRole("cell", { name: "1,100원" }))
  assert.ok(screen.getByRole("cell", { name: "다이아 100 + 덤 10" }))
  assert.ok(screen.getByRole("cell", { name: "다이아 30" }))
  assert.ok(screen.getByRole("cell", { name: "판매 중지" }))
  assert.ok(screen.getByRole("cell", { name: "골드 500 (규칙 어김: 상점에 안 보임)" }))
})

test("AD-194 고치기 → expectedVersion + 바꿀 칸(숫자) → 저장 안내·목록 다시 읽음", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let saved = PRODUCT
  server.answerWith("GET /admin-api/products", () => ({ status: 200, body: { ok: true, items: [saved] } }))
  server.answerWith("PATCH /admin-api/products/diamond-110", () => {
    saved = { ...PRODUCT, payAmount: 1200, status: "STOPPED", version: 2 }
    return { status: 200, body: { ok: true, product: saved } }
  })
  await open()
  fireEvent.click(screen.getByRole("button", { name: "다이아 110개 고치기" }))
  fireEvent.change(screen.getByLabelText("값(원)"), { target: { value: "1200" } })
  fireEvent.change(screen.getByLabelText("판매"), { target: { value: "STOPPED" } })
  await save()

  const patch = server.calls.find((call) => call.method === "PATCH")
  assert.deepEqual(JSON.parse(patch.body), {
    expectedVersion: 1, displayName: "다이아 110개", payAmount: 1200, grantAmount: 100, bonusAmount: 10, status: "STOPPED", sortOrder: 1,
  })
  assert.ok(screen.getByText("'다이아 110개' 저장했어요 (2판)."))
  assert.ok(screen.getByRole("cell", { name: "1,200원" }))
})

test("AD-194 규칙 어긴 칸은 칸 옆에, 남이 먼저 고쳤으면 서버 안내", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer("GET /admin-api/products", 200, { ok: true, items: [PRODUCT] })
  server.answer("PATCH /admin-api/products/diamond-110", 400, { ok: false, code: "INVALID_PRODUCT", message: "x", field: "bonusAmount" })
  await open()
  fireEvent.click(screen.getByRole("button", { name: "다이아 110개 고치기" }))
  fireEvent.change(screen.getByLabelText("덤"), { target: { value: "-5" } })
  await save()
  assert.ok(screen.getByText("0 이상 정수로 적어 주세요."))
  assert.equal(JSON.parse(server.calls.find((call) => call.method === "PATCH").body).bonusAmount, -5)

  server.answer("PATCH /admin-api/products/diamond-110", 409, { ok: false, code: "PRODUCT_VERSION_CONFLICT", message: "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 고쳐 주세요.", currentVersion: 2 })
  await save()
  assert.ok(screen.getByText("다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 고쳐 주세요."))
})

test("AD-194 새 상품 → 만들기 몸(id·종류·값), 같은 id면 안내", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/products", 200, { ok: true, items: [] })
  server.answer("POST /admin-api/products", 409, { ok: false, code: "PRODUCT_EXISTS", message: "이미 있는 상품 id예요. 다른 id를 써 주세요." })
  await open()
  assert.ok(screen.getByText("아직 상품이 없어요. 새 상품을 만들어 주세요."))
  fireEvent.click(screen.getByRole("button", { name: "새 상품" }))
  fireEvent.change(screen.getByLabelText("상품 id"), { target: { value: "gold-500" } })
  fireEvent.change(screen.getByLabelText("종류"), { target: { value: "GOLD_PURCHASE" } })
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: " 골드 500 " } })
  fireEvent.change(screen.getByLabelText("값(다이아)"), { target: { value: "30" } })
  fireEvent.change(screen.getByLabelText("받는 양"), { target: { value: "500" } })
  await save()
  assert.deepEqual(JSON.parse(server.calls.find((call) => call.method === "POST").body), {
    productId: "gold-500", kind: "GOLD_PURCHASE", displayName: "골드 500", payAmount: 30, grantAmount: 500, bonusAmount: 0, status: "ON_SALE", sortOrder: 0,
  })
  assert.ok(screen.getByText("이미 있는 상품 id예요. 다른 id를 써 주세요."))
})
