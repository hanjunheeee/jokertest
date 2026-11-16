// 친구 목록 패널 부품 시험 (접속 글·즐겨찾기 별·차단·차단 탭 글·풀기·받은 신청 탭·받기 보내는 중·검색 칸 안내·초대 단추 꺼짐)
// 목록 A13-F-201~214·219 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, within } = await import("@testing-library/react")
const { ROW_OFFLINE_OVERLAY_CLASS } = await import("../../src/domains/lobby/constants/friendListStyle.js")
const { installFetch, signIn, resetAll, friend, openPanel, openTab, press, HOLD } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

const rowOf = (id) => document.querySelector(`li[data-friend-id="${id}"]`)
// 그 줄에 오프라인 덮개가 있는지
const hasOfflineCover = (row) => [...row.querySelectorAll("span")].some((el) => el.className === ROW_OFFLINE_OVERLAY_CLASS)

// 받은 신청 둘 (가람·나래)
const REQUESTS = [
  { request_id: 21, id: "u-ga", name: "가람" },
  { request_id: 22, id: "u-na", name: "나래" },
]

test("A13-F-201 online: true 친구 줄 → \"접속 중\"", async () => {
  signIn()
  installFetch({ "GET /friends": { body: { data: [friend("f1", "가람", true)] } } })
  await openPanel()
  assert.match(rowOf("f1").textContent, /접속 중/)
  assert.equal(hasOfflineCover(rowOf("f1")), false)
})

test("A13-F-202 online: false 친구 줄 → \"오프라인\" + 배지 덮개", async () => {
  signIn()
  installFetch({ "GET /friends": { body: { data: [friend("f2", "나래", false)] } } })
  await openPanel()
  // 오프라인 폴더는 접혀 있어 펼쳐서 봄
  const folder = screen.getAllByRole("button").find((b) => b.textContent.startsWith("오프라인 ("))
  if (!rowOf("f2")) await press(folder)
  assert.match(rowOf("f2").textContent, /오프라인/)
  assert.equal(hasOfflineCover(rowOf("f2")), true)
})

test("A13-F-203 꺼진 별 누름 → PUT /friends/favorites/<id> { favorite: true } 1번", async () => {
  signIn()
  const http = installFetch({
    "GET /friends": { body: { data: [friend("f1", "가람", true)] } },
    "PUT /friends/favorites/f1": { body: { data: { friendId: "f1", favorite: true } } },
  })
  await openPanel()
  await press(within(rowOf("f1")).getByRole("button", { name: "즐겨찾기 추가" }))
  assert.deepEqual(http.to("PUT", "/friends/favorites/f1").map((c) => c.body), [{ favorite: true }])
})

test("A13-F-204 켜진 별 누름 → { favorite: false }", async () => {
  signIn()
  const http = installFetch({
    "GET /friends": { body: { data: [friend("f1", "가람", true)] } },
    "GET /friends/favorites": { body: { data: ["f1"] } },
    "PUT /friends/favorites/f1": { body: { data: { friendId: "f1", favorite: false } } },
  })
  await openPanel()
  const folder = screen.getAllByRole("button").find((b) => b.textContent.startsWith("즐겨찾기 ("))
  if (!rowOf("f1")) await press(folder)
  await press(within(rowOf("f1")).getByRole("button", { name: "즐겨찾기 해제" }))
  assert.deepEqual(http.to("PUT", "/friends/favorites/f1").map((c) => c.body), [{ favorite: false }])
})

test("A13-F-205 친구 줄 차단 → POST /friends/blocks { targetId } 1번, 성공 뒤 그 줄 없음", async () => {
  signIn()
  let blocked = false
  const http = installFetch({
    "GET /friends": () => ({ body: { data: blocked ? [] : [friend("f1", "가람", true)] } }),
    "POST /friends/blocks": () => { blocked = true; return { status: 201, body: { data: { blockedId: "f1", cancelledInvites: 0 } } } },
  })
  await openPanel()
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 차단" }))
  assert.deepEqual(http.to("POST", "/friends/blocks").map((c) => c.body), [{ targetId: "f1" }])
  assert.equal(rowOf("f1"), null)
})

test("A13-F-206 차단 탭 불러오는 중 → \"차단 목록을 불러오는 중입니다.\"", async () => {
  signIn()
  const http = installFetch({ "GET /friends/blocks": HOLD })
  await openPanel()
  await openTab("차단 목록")
  assert.ok(screen.getByText("차단 목록을 불러오는 중입니다."))
  await http.release("GET", "/friends/blocks", { body: { data: [] } })
})

test("A13-F-207 차단 0명 → \"차단한 사용자가 없습니다.\"", async () => {
  signIn()
  installFetch()
  await openPanel()
  await openTab("차단 목록")
  assert.ok(screen.getByText("차단한 사용자가 없습니다."))
})

test("A13-F-208 차단 목록 받기 실패 → 오류 글만, \"없습니다\" 안 보임", async () => {
  signIn()
  installFetch({ "GET /friends/blocks": { status: 500, body: { message: "차단 목록 오류" } } })
  await openPanel()
  await openTab("차단 목록")
  assert.equal(document.querySelector("[data-block-list-error]")?.textContent, "차단 목록 오류")
  assert.equal(screen.queryByText("차단한 사용자가 없습니다."), null)
})

test("A13-F-209 차단 탭에서 풀기 → DELETE /friends/blocks/<id> 1번, 성공 뒤 그 줄 없음", async () => {
  signIn()
  let unblocked = false
  const http = installFetch({
    "GET /friends/blocks": () => ({ body: { data: unblocked ? [] : [{ id: "b1", name: "나래" }] } }),
    "DELETE /friends/blocks/b1": () => { unblocked = true; return { body: { data: { ok: true } } } },
  })
  await openPanel()
  await openTab("차단 목록")
  await press(screen.getByRole("button", { name: "나래 차단 해제" }))
  assert.equal(http.to("DELETE", "/friends/blocks/b1").length, 1)
  assert.equal(document.querySelector('li[data-blocked-id="b1"]'), null)
})

test("A13-F-210 받은 신청 2개 → 줄마다 수락·거절 단추", async () => {
  signIn()
  installFetch({ "GET /friends/requests/incoming": { body: { data: REQUESTS } } })
  await openPanel()
  await openTab("요청 수락")
  for (const name of ["가람", "나래"]) {
    assert.ok(screen.getByRole("button", { name: `${name} 수락` }))
    assert.ok(screen.getByRole("button", { name: `${name} 거절` }))
  }
  assert.equal(document.querySelectorAll("li[data-request-id]").length, 2)
})

test("A13-F-211 받은 신청 0개 → \"받은 친구 요청이 없습니다.\"", async () => {
  signIn()
  installFetch()
  await openPanel()
  await openTab("요청 수락")
  assert.ok(screen.getByText("받은 친구 요청이 없습니다."))
})

test("A13-F-212 수락 누름 → PUT accept 1번, 답 오기 전 수락·거절 단추 꺼짐", async () => {
  signIn()
  const http = installFetch({
    "GET /friends/requests/incoming": { body: { data: REQUESTS } },
    "PUT /friends/requests/21/accept": HOLD,
  })
  await openPanel()
  await openTab("요청 수락")
  await press(screen.getByRole("button", { name: "가람 수락" }))
  assert.equal(http.to("PUT", "/friends/requests/21/accept").length, 1)
  assert.equal(screen.getByRole("button", { name: "가람 수락" }).disabled, true)
  assert.equal(screen.getByRole("button", { name: "가람 거절" }).disabled, true)
  await http.release("PUT", "/friends/requests/21/accept", { body: { data: { ok: true } } })
})

test("A13-F-213 친구 탭 검색 칸 안내 → \"검색할 친구 닉네임 입력\"", async () => {
  signIn()
  installFetch()
  await openPanel()
  assert.equal(screen.getByRole("searchbox").getAttribute("placeholder"), "검색할 친구 닉네임 입력")
})

test("A13-F-214 받은 신청 탭 검색 칸 안내 → \"닉네임 또는 ID 입력\"", async () => {
  signIn()
  installFetch()
  await openPanel()
  await openTab("요청 수락")
  assert.equal(screen.getByRole("searchbox").getAttribute("placeholder"), "닉네임 또는 ID 입력")
})

test("A13-F-219 대기방 확인 중 친구 줄 초대 단추 → 꺼짐, 까닭 \"대기방 상태를 확인하는 중입니다.\"", async () => {
  signIn()
  installFetch({ "GET /friends": { body: { data: [friend("f1", "가람", true)] } } })
  await openPanel({ roomId: "room-1", isRoomVerified: false })
  const button = within(rowOf("f1")).getByRole("button", { name: "가람 게임 초대" })
  assert.equal(button.disabled, true)
  assert.equal(button.getAttribute("title"), "대기방 상태를 확인하는 중입니다.")
})
