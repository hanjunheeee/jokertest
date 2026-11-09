// 2-9 쿠폰 화면 시험: 목록(쓴 수/횟수·기간·상태), 새 쿠폰(대문자·한국 시각 → UTC), 규칙 어긴 칸, 끄기, 쓴 사람 보기
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: CouponsPage } = await import("../../../src/admin/domains/coupons/pages/CouponsPage.jsx")

test.afterEach(() => cleanup())

const COUPON = {
  id: 7, code: "WELCOME-1", rewardType: "GOLD", rewardAmount: 500, maxUses: 100, usedCount: 1,
  startsAt: null, endsAt: "2026-11-30T14:59:00.000Z", isActive: true, createdAt: "2026-11-10T03:00:00.000Z",
}

const open = async () => {
  await act(async () => { render(React.createElement(MemoryRouter, null, React.createElement(CouponsPage))) })
}

test("AD-214 목록: 보상·쓴 수/횟수·기간(한국 시각)·상태", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/coupons", 200, { ok: true, items: [COUPON, { ...COUPON, id: 8, code: "FREE-DIA", rewardType: "DIAMOND", maxUses: null, endsAt: null, isActive: false }], nextBefore: null })
  await open()
  assert.ok(screen.getByRole("cell", { name: "골드 500" }))
  assert.ok(screen.getByRole("cell", { name: "1 / 100" }))
  assert.ok(screen.getByRole("cell", { name: "1 / 제한 없음" }))
  assert.ok(screen.getByRole("cell", { name: "~ 2026-11-30 23:59" }))
  assert.ok(screen.getByRole("cell", { name: "언제나" }))
  assert.ok(screen.getByRole("cell", { name: "꺼짐" }))
})

test("AD-214 새 쿠폰 → 코드 대문자·빈 횟수 null·한국 시각 → UTC, 규칙 어긴 칸 표시 → 고쳐서 만들기", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  let created = false
  server.answerWith("GET /admin-api/coupons", () => ({ status: 200, body: { ok: true, items: created ? [COUPON] : [], nextBefore: null } }))
  server.answer("POST /admin-api/coupons", 400, { ok: false, code: "INVALID_COUPON", message: "x", field: "code" })
  await open()
  fireEvent.click(screen.getByRole("button", { name: "새 쿠폰" }))
  fireEvent.change(screen.getByLabelText("쿠폰 코드"), { target: { value: " welcome-1 " } })
  fireEvent.change(screen.getByLabelText("보상 양"), { target: { value: "500" } })
  fireEvent.change(screen.getByLabelText("끝 시각(한국)"), { target: { value: "2026-11-30T23:59" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "만들기" })) })
  assert.deepEqual(JSON.parse(server.calls.find((call) => call.method === "POST").body), {
    code: "WELCOME-1", rewardType: "GOLD", rewardAmount: 500, maxUses: null, startsAt: null, endsAt: "2026-11-30T14:59:00.000Z",
  })
  assert.ok(screen.getByText("영문 대문자·숫자·- 4~40자로 적어 주세요."))

  server.answerWith("POST /admin-api/coupons", () => {
    created = true
    return { status: 201, body: { ok: true, coupon: COUPON } }
  })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "만들기" })) })
  assert.ok(screen.getByText("WELCOME-1 쿠폰을 만들었어요."))
  assert.equal(screen.queryByRole("form", { name: "새 쿠폰" }), null)
})

test("AD-214 끄기 → PATCH { isActive:false }, 쓴 사람 → 목록(닉네임·시각)", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let active = true
  server.answerWith("GET /admin-api/coupons", () => ({ status: 200, body: { ok: true, items: [{ ...COUPON, isActive: active }], nextBefore: null } }))
  server.answerWith("PATCH /admin-api/coupons/7", () => {
    active = false
    return { status: 200, body: { ok: true, coupon: { ...COUPON, isActive: false } } }
  })
  server.answer("GET /admin-api/coupons/7/redemptions", 200, {
    ok: true, items: [{ id: "r1", userUuid: "11111111-2222-4333-8444-555555555555", nickname: "가면1", redeemedAt: "2026-11-10T03:00:00.000Z" }], nextBefore: null,
  })
  await open()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "WELCOME-1 끄기" })) })
  assert.deepEqual(JSON.parse(server.calls.find((call) => call.method === "PATCH").body), { isActive: false })
  assert.ok(screen.getByText("WELCOME-1 쿠폰을 껐어요."))
  assert.ok(screen.getByRole("button", { name: "WELCOME-1 켜기" }))

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "WELCOME-1 쓴 사람" })) })
  assert.ok(screen.getByRole("heading", { name: "WELCOME-1 쓴 사람 (1명)" }))
  assert.ok(screen.getByRole("link", { name: "가면1" }))
  assert.ok(screen.getByRole("cell", { name: "2026-11-10 12:00" }))
})
