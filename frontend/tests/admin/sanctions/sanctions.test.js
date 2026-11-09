// AD-080 제재 칸 시험: 확인 창에 대상·기간·사유 다시 보임, 사유 비면 버튼 꺼짐, "플레이어에게 보이는 사유" 글귀, 보낸 몸·결과 문구
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, within } = await import("@testing-library/react")
const { default: SanctionPanel } = await import("../../../src/admin/domains/sanctions/components/SanctionPanel.jsx")

test.afterEach(() => cleanup())

const UUID = "11111111-2222-4333-8444-555555555555"
const MEMBER = { uuid: UUID, nickname: "가면왕", withdrawn: false }
const ACTIVE_BAN = { id: 7, reason: "욕설", isPermanent: false, startAt: "2026-11-01T03:00:00.000Z", endAt: "2026-11-08T03:00:00.000Z", active: true }

const draw = (props = {}) => {
  let changed = 0
  render(React.createElement(SanctionPanel, { member: MEMBER, bans: [], onChanged: () => { changed += 1 }, ...props }))
  return { changedCount: () => changed }
}
const type = (label, value) => fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } })
const lastBody = (server) => JSON.parse(server.calls.at(-1).body)

test("AD-080 기간 정지: 대상·기간·사유 다시 보임, 사유 비면 버튼 꺼짐, 플레이어에게 보이는 사유 글귀", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(`POST /admin-api/members/${UUID}/bans`, 201, { ok: true, ban: { id: 1 }, disconnect: { disconnected: 1, partial: false } })
  const { changedCount } = draw()
  fireEvent.click(screen.getByRole("button", { name: "기간 정지" }))

  const dialog = screen.getByRole("dialog", { name: "기간 정지" })
  const confirm = within(dialog).getByRole("button", { name: "정지하기" })
  assert.equal(confirm.disabled, true, "사유 빔 → 꺼짐")
  assert.match(dialog.textContent, /대상: 가면왕/)
  assert.ok(within(dialog).getByLabelText(/플레이어에게 보이는 사유/))

  type("정지 일수", "3")
  type(/정지 사유/, "   ")
  assert.equal(confirm.disabled, true, "빈칸만 → 꺼짐")
  type(/정지 사유/, "욕설")
  assert.match(dialog.textContent, /기간: 3일 \(.+까지\)/)
  assert.match(dialog.textContent, /사유: 욕설/)
  type("정지 일수", "0")
  assert.equal(confirm.disabled, true, "틀린 일수 → 꺼짐")
  type("정지 일수", "3")
  assert.equal(confirm.disabled, false)

  await act(async () => { fireEvent.click(confirm) })
  assert.deepEqual(lastBody(server), { kind: "PERIOD", days: 3, reason: "욕설" })
  assert.match(screen.getByRole("status").textContent, /정지했어요\. 접속 1곳을 바로 끊었어요\./)
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(changedCount(), 1)
})

test("AD-080 영구 정지: 기간 줄 '영구', 일수 칸 없음, 몸에 days 없음", async () => {
  const server = createFakeServer()
  server.answer(`POST /admin-api/members/${UUID}/bans`, 201, { ok: true, ban: { id: 1 }, disconnect: { disconnected: 0, partial: false } })
  draw()
  fireEvent.click(screen.getByRole("button", { name: "영구 정지" }))
  const dialog = screen.getByRole("dialog", { name: "영구 정지" })
  assert.match(dialog.textContent, /기간: 영구/)
  assert.equal(within(dialog).queryByLabelText("정지 일수"), null)
  type(/정지 사유/, "핵 사용")
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "정지하기" })) })
  assert.deepEqual(lastBody(server), { kind: "PERMANENT", reason: "핵 사용" })
  assert.match(screen.getByRole("status").textContent, /끊을 접속이 없었어요/)
})

test("AD-080 이미 정지 중(409) → 창에 서버 문구(기간 바꾸기 안내), 창은 그대로", async () => {
  const server = createFakeServer()
  server.answer(`POST /admin-api/members/${UUID}/bans`, 409, { ok: false, code: "ALREADY_BANNED", message: '이미 정지 중이에요. 기간을 바꾸려면 "기간 바꾸기"를 써 주세요.', banId: 7 })
  draw()
  fireEvent.click(screen.getByRole("button", { name: "영구 정지" }))
  type(/정지 사유/, "또")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "정지하기" })) })
  assert.match(screen.getByRole("alert").textContent, /이미 정지 중이에요.*기간 바꾸기/)
  assert.ok(screen.getByRole("dialog"))
})

test("AD-080 정지 중이면 기간 바꾸기·제재 해제만, 해제도 사유 비면 꺼짐", async () => {
  const server = createFakeServer()
  server.answer(`POST /admin-api/members/${UUID}/unban`, 200, { ok: true, liftedCount: 1 })
  server.answer(`PATCH /admin-api/members/${UUID}/bans/7`, 200, { ok: true, ban: { ...ACTIVE_BAN, isPermanent: true } })
  draw({ bans: [ACTIVE_BAN] })
  assert.equal(screen.queryByRole("button", { name: "기간 정지" }), null)
  assert.match(screen.getByText(/정지 중/).closest("p").textContent, /사유: 욕설/)

  fireEvent.click(screen.getByRole("button", { name: "기간 바꾸기" }))
  let dialog = screen.getByRole("dialog", { name: "정지 기간 바꾸기" })
  assert.ok(within(dialog).getByLabelText(/관리자 기록에만/))
  fireEvent.change(within(dialog).getByLabelText("종류"), { target: { value: "PERMANENT" } })
  type(/바꾸는 사유/, "반복")
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "기간 바꾸기" })) })
  assert.deepEqual(lastBody(server), { kind: "PERMANENT", reason: "반복" })

  fireEvent.click(screen.getByRole("button", { name: "제재 해제" }))
  dialog = screen.getByRole("dialog", { name: "제재 해제" })
  const lift = within(dialog).getByRole("button", { name: "해제하기" })
  assert.equal(lift.disabled, true)
  type("해제 사유", "오해였음")
  assert.match(dialog.textContent, /사유: 오해였음/)
  await act(async () => { fireEvent.click(lift) })
  assert.deepEqual(lastBody(server), { reason: "오해였음" })
  assert.match(screen.getByRole("status").textContent, /정지 1건을 풀었어요/)
})

test("AD-080 강제 접속 종료: 사유 필수, 일부 서버 못 닿으면 안내", async () => {
  const server = createFakeServer()
  server.answer(`POST /admin-api/members/${UUID}/force-disconnect`, 200, { ok: true, disconnected: 1, partial: true })
  draw()
  fireEvent.click(screen.getByRole("button", { name: "강제 접속 종료" }))
  const dialog = screen.getByRole("dialog", { name: "강제 접속 종료" })
  assert.match(dialog.textContent, /대상: 가면왕/)
  assert.equal(within(dialog).getByRole("button", { name: "접속 끊기" }).disabled, true)
  type(/끊는 사유/, "게임 멈춤")
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "접속 끊기" })) })
  assert.deepEqual(lastBody(server), { reason: "게임 멈춤" })
  assert.match(screen.getByRole("status").textContent, /접속 1곳을 바로 끊었어요\. 닿지 않은 서버가 있어/)
})

test("AD-080 탈퇴 회원은 버튼 없음", () => {
  draw({ member: { ...MEMBER, withdrawn: true } })
  assert.equal(screen.queryAllByRole("button").length, 0)
  assert.ok(screen.getByText("탈퇴한 회원이라 제재할 수 없어요."))
})
