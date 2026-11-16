// 관리자 처리 이력 화면 시험: 기록 동작 24개 이름표, 제재 종류 글, 칸 고르면 거름(kind), 판 골드 줄 전후 값 펼쳐 보기
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-060~087, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-audit-logs.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, cleanup, press, settle, callsOf, createFakeServer, act, fireEvent } from "./a14-kit.mjs"

const { default: AuditRow } = await import("../../src/admin/domains/auditLogs/components/AuditRow.jsx")
const { default: AuditLogsPage } = await import("../../src/admin/domains/auditLogs/pages/AuditLogsPage.jsx")

test.afterEach(() => cleanup())

// 기록 한 줄 (서버 처리 이력 모양)
const rowOf = (over = {}) => ({
  id: 1, action: "ADMIN_LOGIN", targetType: null, targetId: null, target: null,
  before: null, after: null, reason: null, ip: "203.0.*.*", accessEmail: "ceo@example.com",
  createdAt: "2026-11-16T03:00:00.000Z", admin: { loginId: "ceo" },
  ...over,
})

// 카드 맨 위 "무엇을" 글
const kindShown = (row) => {
  render(h(AuditRow, { row }))
  return document.querySelector("article p span").textContent
}

// 기록 동작 → 화면 이름표 (목록: AuditRow.jsx 표 그대로) (값 24)
const ACTION_CASES = [
  ["A14-F-060", "ADMIN_LOGIN", "로그인"],
  ["A14-F-061", "ADMIN_LOGOUT", "로그아웃"],
  ["A14-F-062", "VIEW_PII", "이메일 전체 보기"],
  ["A14-F-063", "VIEW_EVIDENCE", "채팅 증거 보기"],
  ["A14-F-064", "FORCE_DISCONNECT", "강제 접속 종료"],
  ["A14-F-065", "BAN", "정지"],
  ["A14-F-066", "BAN_UPDATE", "정지 기간 바꿈"],
  ["A14-F-067", "UNBAN", "정지 해제"],
  ["A14-F-068", "REPORT_RESOLVE", "신고 처리"],
  ["A14-F-069", "REPORT_DISMISS", "신고 기각"],
  ["A14-F-070", "ANNOUNCE", "공지"],
  ["A14-F-071", "INQUIRY_REPLY", "문의 답"],
  ["A14-F-072", "MAINTENANCE_UPDATE", "점검 바꿈"],
  ["A14-F-073", "MAINTENANCE_FORCE_END", "점검 강제 종료"],
  ["A14-F-074", "BANNED_WORD_ADD", "금지어 넣기"],
  ["A14-F-075", "BANNED_WORD_TOGGLE", "금지어 켜기·끄기"],
  ["A14-F-076", "REFUND", "환불"],
  ["A14-F-077", "WALLET_ADJUST", "골드·다이아 주고 뺏기"],
  ["A14-F-078", "PRODUCT_CREATE", "상품 만들기"],
  ["A14-F-079", "PRODUCT_UPDATE", "상품 고치기"],
  ["A14-F-080", "COUPON_CREATE", "쿠폰 만들기"],
  ["A14-F-081", "COUPON_TOGGLE", "쿠폰 켜기·끄기"],
  ["A14-F-082", "TERMS_CREATE", "약관 새 버전"],
  ["A14-F-083", "GAME_SETTING_UPDATE", "판 골드 바꿈"],
]
for (const [no, action, label] of ACTION_CASES) {
  test(`${no} 기록 동작 이름표: ${action} → "${label}"`, () => {
    assert.equal(kindShown(rowOf({ action })), label)
    // 영어 동작 이름은 화면에 안 나옴
    assert.equal(document.body.textContent.includes(action), false)
  })
}

// 제재 종류 글 (값 2)
const BAN_CASES = [
  ["A14-F-084", { kind: "PERIOD", days: 7 }, "기간 정지 7일"],
  ["A14-F-085", { kind: "PERMANENT" }, "영구 정지"],
]
for (const [no, after, text] of BAN_CASES) {
  test(`${no} 제재 종류 글: ${JSON.stringify(after)} → "${text}"`, () => {
    const shown = kindShown(rowOf({ action: "BAN", targetType: "USER", target: { nickname: "가면1" }, after, reason: "욕설" }))
    assert.ok(shown.includes(text), `"${text}" 없음: ${shown}`)
  })
}

test("A14-F-086 칸 고르면 거름: \"공지 발송 이력\" → kind=announce 요청, \"제재·해제 이력\" → kind=sanction", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/admins", 200, { ok: true, items: [] })
  for (const kind of ["all", "announce", "sanction"]) {
    server.answer(`GET /admin-api/audit-logs?kind=${kind}`, 200, { ok: true, items: [], nextBefore: null })
  }
  render(h(AuditLogsPage))
  await settle()
  await press(screen.getByRole("button", { name: "공지 발송 이력" }))
  await press(screen.getByRole("button", { name: "제재·해제 이력" }))
  const kinds = callsOf(server, "GET", /^\/admin-api\/audit-logs\?/).map((c) => new URLSearchParams(c.url.split("?")[1]).get("kind"))
  assert.deepEqual(kinds, ["all", "announce", "sanction"])
  assert.equal(screen.getByRole("button", { name: "제재·해제 이력" }).getAttribute("aria-pressed"), "true")
})

test("A14-F-087 전후 값 펼쳐 보기: 판 골드 줄 펼침 → 전 1·후 2 보임", async () => {
  render(h(AuditRow, { row: rowOf({ action: "GAME_SETTING_UPDATE", targetType: "GAME_SETTING", targetId: "GAME_GOLD_REWARD", before: { goldReward: 1 }, after: { goldReward: 2 } }) }))
  const details = document.querySelector("details")
  assert.equal(details.open, false)
  await act(async () => { fireEvent.click(details.querySelector("summary")) })
  assert.equal(details.open, true)
  // 전·후 칸 글 → ['{ "goldReward": 1 }', '{ "goldReward": 2 }']
  const [before, after] = [...details.querySelectorAll("pre")].map((pre) => JSON.parse(pre.textContent))
  assert.deepEqual(before, { goldReward: 1 })
  assert.deepEqual(after, { goldReward: 2 })
})
