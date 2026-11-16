// 관리자 공지 화면 시험: 보내기 두 번 눌러도 요청 하나, 발송 결과 수 표시, 고른 사람 0명이면 보내기 꺼짐, 닉네임 찾기(누름·Enter)가 공지를 안 보냄
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-057~059·111~112, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-announcements.test.js
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, render, screen, within, cleanup, act, fireEvent, type, press, settle, buttonNamed, dialog, bodyText, callsOf, createFakeServer,
} from "./a14-kit.mjs"

const { default: AnnouncementsPage } = await import("../../src/admin/domains/announcements/pages/AnnouncementsPage.jsx")

test.afterEach(() => cleanup())

const SEND = "/admin-api/announcements"

// 공지 화면 열고 제목·본문 채우기, result: 서버 발송 결과
async function openFilled(result = { recipientCount: 2, created: 2, duplicated: 0, failed: 0 }) {
  const server = createFakeServer()
  server.answer(`POST ${SEND}`, 200, { ok: true, result, auditId: 1 })
  render(h(AnnouncementsPage))
  await settle()
  await type(screen.getByLabelText("제목"), "점검 안내")
  await type(screen.getByLabelText("본문"), "오늘 밤 점검이 있어요.")
  return server
}

// 폼의 "보내기" → 확인 창의 "보내기"
async function sendOnce() {
  const form = screen.getByLabelText("제목").closest("form")
  await press(within(form).getByRole("button", { name: "보내기" }))
  await press(within(dialog()).getByRole("button", { name: "보내기" }))
  await settle()
}

test("A14-F-057 보내기 두 번 눌러도 요청 하나: 확인 창 \"보내기\" 빠르게 두 번 → 요청 1번 (두 번이면 같은 requestId)", async () => {
  const server = await openFilled()
  const form = screen.getByLabelText("제목").closest("form")
  await press(within(form).getByRole("button", { name: "보내기" }))
  const confirm = within(dialog()).getByRole("button", { name: "보내기" })
  // 다시 그리기 전에 두 번 누름
  await act(async () => {
    fireEvent.click(confirm)
    fireEvent.click(confirm)
  })
  await settle()
  const sent = callsOf(server, "POST", SEND)
  assert.ok(sent.length >= 1, "요청이 안 나감")
  const ids = new Set(sent.map((c) => JSON.parse(c.body).requestId))
  assert.equal(ids.size, 1, "요청 번호가 서로 다름")
  assert.equal(sent.length, 1)
})

test("A14-F-058 결과 수 표시: { recipientCount:3, created:2, duplicated:1, failed:1 } → 받은·새로 보냄·중복·실패 수 글", async () => {
  await openFilled({ recipientCount: 3, created: 2, duplicated: 1, failed: 1 })
  await sendOnce()
  const box = screen.getByRole("status", { name: "발송 결과" })
  // [이름표, 숫자] 짝 → { 받는 사람: '3', … }
  const pairs = Object.fromEntries([...box.querySelectorAll("dl > div")].map((div) => [div.querySelector("dt").textContent, div.querySelector("dd").textContent]))
  assert.deepEqual(pairs, { "받는 사람": "3", "새로 보냄": "2", "이미 받음(중복)": "1", "실패": "1" })
})

test("A14-F-059 고른 사람 0명: 대상 \"고른 사람\" + 0명 → 보내기 꺼짐", async () => {
  const server = await openFilled()
  const form = screen.getByLabelText("제목").closest("form")
  // 처음(접속 중 전체)엔 켜짐
  assert.equal(within(form).getByRole("button", { name: "보내기" }).disabled, false)
  await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "고른 사람" })) })
  assert.match(form.textContent, /고른 사람 0명/)
  assert.equal(within(form).getByRole("button", { name: "보내기" }).disabled, true)
  await press(within(form).getByRole("button", { name: "보내기" }))
  assert.ok(dialog() === null, "확인 창이 뜸")
  assert.equal(callsOf(server, "POST", SEND).length, 0)
  assert.ok(buttonNamed("찾기") !== null, "받을 사람 찾기 칸이 없음")
})

const FOUND_URL = "/admin-api/members?q=%EA%B0%80%EB%A9%B4&limit=20"
const FOUND = [
  { uuid: "a14f0000-0000-4000-8000-0000000000a1", nickname: "가면1" },
  { uuid: "a14f0000-0000-4000-8000-0000000000a2", nickname: "가면2" },
]

// 제목·본문 채운 공지 화면 → "고른 사람" → 찾기 칸에 "가면"
async function openPicker() {
  const server = await openFilled()
  server.answer(`GET ${FOUND_URL}`, 200, { ok: true, items: FOUND })
  await act(async () => { fireEvent.click(screen.getByRole("radio", { name: "고른 사람" })) })
  const field = screen.getByLabelText("받을 사람 찾기")
  await type(field, "가면")
  return { server, field }
}

// 찾은 뒤 공통 확인: 찾기 요청 1번, 공지 보내기 요청 0번, 확인 창 없음, 쓰던 제목·본문 그대로
function assertSearchedOnly(server) {
  assert.equal(callsOf(server, "GET", FOUND_URL).length, 1, "회원 찾기 요청이 안 나감")
  assert.equal(callsOf(server, "POST", SEND).length, 0, "공지 보내기 요청이 나감")
  assert.ok(dialog() === null, "공지 확인 창이 뜸")
  assert.equal(screen.getByLabelText("제목").value, "점검 안내")
  assert.equal(screen.getByLabelText("본문").value, "오늘 밤 점검이 있어요.")
  // 폼 안 폼이면 브라우저가 찾기를 바깥 화면 다시 열기로 처리함 (브라우저 A14-E-049)
  assert.equal(document.querySelectorAll("form form").length, 0, "폼 안에 폼이 있음")
}

test("A14-F-111 고른 사람 닉네임 찾기: \"찾기\" 누름 → 회원 찾기 요청 1번·공지 보내기 0번·제목·본문 그대로 → 두 명 넣고 하나 빼기 → 보낼 때 남은 한 명", async () => {
  const { server } = await openPicker()
  await press(buttonNamed("찾기"))
  assertSearchedOnly(server)
  const found = screen.getByRole("list", { name: "찾은 회원" })
  await press(within(within(found).getByText(/가면1/).closest("li")).getByRole("button", { name: "넣기" }))
  await press(within(within(found).getByText(/가면2/).closest("li")).getByRole("button", { name: "넣기" }))
  assert.match(bodyText(), /고른 사람 2명/)
  await press(screen.getByRole("button", { name: "가면1 빼기" }))
  assert.match(bodyText(), /고른 사람 1명/)
  await sendOnce()
  const sent = callsOf(server, "POST", SEND)
  assert.equal(sent.length, 1)
  assert.deepEqual(JSON.parse(sent[0].body).userUuids, [FOUND[1].uuid])
})

test("A14-F-112 고른 사람 닉네임 찾기: 찾기 칸에서 Enter → 회원 찾기 요청 1번·공지 보내기 0번(바깥 폼 안 보냄)·제목·본문 그대로", async () => {
  const { server, field } = await openPicker()
  let notPrevented = true
  await act(async () => { notPrevented = fireEvent.keyDown(field, { key: "Enter", code: "Enter" }) })
  await settle()
  assert.equal(notPrevented, false, "Enter 기본 동작(바깥 폼 보내기)을 안 막음")
  assertSearchedOnly(server)
  assert.ok(screen.getByRole("list", { name: "찾은 회원" }), "찾은 회원 목록이 없음")
})
