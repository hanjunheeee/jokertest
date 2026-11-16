// 관리자 회원 찾기·상세 시험: 찾기 결과 빈 글·탈퇴함·접속 중, 상세 칸 다 있음, 이메일 보기 단추
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-043~047, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-members.test.js
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, screen, cleanup, openAt, press, buttonNamed, bodyText, callsOf, createFakeServer,
  MEMBER_UUID, memberOf, detailOf, openMemberDetail,
} from "./a14-kit.mjs"

const { default: MembersPage } = await import("../../src/admin/domains/members/pages/MembersPage.jsx")

test.afterEach(() => cleanup())

const Q = "가면"
const SEARCH = `GET /admin-api/members?${new URLSearchParams({ q: Q })}`

// 찾기 화면을 ?q=가면 으로 열기, items: 서버 찾기 결과
async function openSearch(items) {
  const server = createFakeServer()
  server.answer(SEARCH, 200, { ok: true, items, nextBefore: null })
  await openAt(`/members?q=${encodeURIComponent(Q)}`, h(MembersPage))
  return server
}

// 찾기 결과 줄 (서버 회원 찾기 모양)
const rowOf = (over = {}) => {
  const { uuid, nickname, emailMasked, status, online, withdrawn, createdAt } = memberOf(over)
  return { uuid, nickname, emailMasked, status, online, banned: false, withdrawn, createdAt }
}
// 표에서 그 닉네임 줄의 글
const rowText = (nickname) => [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(nickname))?.textContent ?? ""

test("A14-F-043 찾기 결과 표시: 빈 목록 → \"없음\" 글", async () => {
  await openSearch([])
  assert.match(bodyText(), /없음 — 이 말로 찾은 회원이 없어요\./)
  assert.equal(document.querySelectorAll("tbody tr").length, 0)
})

test("A14-F-044 찾기 결과 표시: 탈퇴 회원 → \"탈퇴함\"", async () => {
  await openSearch([rowOf({ nickname: "가면탈퇴", withdrawn: true, status: "WITHDRAWN" })])
  assert.match(rowText("가면탈퇴"), /탈퇴함/)
  assert.doesNotMatch(rowText("가면탈퇴"), /접속 중/)
})

test("A14-F-045 찾기 결과 표시: 접속 중 → \"접속 중\"", async () => {
  await openSearch([rowOf({ nickname: "가면접속", online: true }), rowOf({ uuid: "a14f0000-0000-4000-8000-000000000002", nickname: "가면쉼" })])
  assert.match(rowText("가면접속"), /접속 중/)
  // 접속 안 한 사람 줄엔 "접속 중" 없음
  assert.doesNotMatch(rowText("가면쉼"), /접속 중/)
})

test("A14-F-046 상세 칸: 가입일·상태·정지 기록(해제 사유·해제한 관리자)·받은 신고·최근 로그인(가린 IP)·탈주 기록 칸이 다 있음", async () => {
  const detail = detailOf({
    bans: [{
      id: 1, active: false, isPermanent: false, startAt: "2026-11-02T00:00:00.000Z", endAt: "2026-11-09T00:00:00.000Z",
      reason: "욕설", bannedByLoginId: "ceo", liftReason: "오해였음", liftedByLoginId: "ops2", liftedAt: "2026-11-03T00:00:00.000Z",
    }],
    reportsReceived: [{ id: 9, createdAt: "2026-11-05T00:00:00.000Z", reasonCode: "ABUSE", status: "OPEN" }],
    logins: [{ at: "2026-11-15T00:00:00.000Z", ipMasked: "203.0.*.*", success: true }],
    desertions: [{ id: 1, gameId: "a14-game-1", reason: "LEFT_ALIVE", desertedAt: "2026-11-14T03:00:00.000Z", blockedUntil: "2026-11-14T03:05:00.000Z", active: false }],
  })
  await openMemberDetail({ detail })
  const labels = [...document.querySelectorAll("dt")].map((dt) => dt.textContent)
  for (const label of ["가입일", "상태"]) assert.ok(labels.includes(label), `"${label}" 칸 없음`)
  const headings = [...document.querySelectorAll("h2")].map((el) => el.textContent)
  for (const title of ["정지 기록", "받은 신고", "최근 로그인", "탈주 기록"]) assert.ok(headings.includes(title), `"${title}" 칸 없음`)
  const heads = [...document.querySelectorAll("th")].map((th) => th.textContent)
  for (const head of ["해제 사유", "해제한 관리자"]) assert.ok(heads.includes(head), `"${head}" 칸 없음`)
  const text = bodyText()
  for (const value of ["오해였음", "ops2", "203.0.*.*", "산 채로 나감", "2026-11-01"]) assert.ok(text.includes(value), `"${value}" 안 보임`)
})

test("A14-F-047 이메일 보기 단추: 처음 가린 이메일 → \"이메일 보기\" 누름 → 전체 이메일", async () => {
  const server = await openMemberDetail()
  server.answer(`POST /admin-api/members/${MEMBER_UUID}/reveal-email`, 200, { ok: true, email: "abc@example.com" })
  assert.ok(bodyText().includes("a***c@e***.com"), "가린 이메일이 처음에 안 보임")
  assert.equal(bodyText().includes("abc@example.com"), false)
  await press(buttonNamed("이메일 보기"))
  assert.ok(bodyText().includes("abc@example.com"), "전체 이메일이 안 보임")
  assert.equal(callsOf(server, "POST", `/admin-api/members/${MEMBER_UUID}/reveal-email`).length, 1)
  assert.ok(screen.queryByRole("button", { name: "이메일 보기" }) === null, "보기 단추가 남아 있음")
})
