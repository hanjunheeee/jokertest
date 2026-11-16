// 보낸 친구 신청 목록·취소 화면 시험 (친구 추가 탭의 보낸 신청 줄·취소 단추 이름·취소 요청·두 번 누름·실패 글·검색 중 숨김·실시간으로 사라짐)
// 목록 A13-F-501~516 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md "친구 신청 취소·친구 끊기" 장), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-cancel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, within, fireEvent, act, render } = await import("@testing-library/react")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const {
  installFetch, fakeSocket, say, signIn, resetAll, openPanel, openTab, press, typeInto, settle, HOLD,
} = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 내가 보낸 대기 신청 둘 (지유·가람) — 서버 보낸 신청 목록 한 줄 모양
const SENT = [
  { request_id: 31, id: "u-jy", name: "지유", created_at: "2026-11-16T02:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
  { request_id: 32, id: "u-gr", name: "가람", created_at: "2026-11-16T01:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
]
const OUT = "/friends/requests/outgoing"

const sentRows = () => [...document.querySelectorAll("li[data-outgoing-request-id]")]
const sentRow = (id) => document.querySelector(`li[data-outgoing-request-id="${id}"]`)
const sentNames = () => sentRows().map((li) => li.querySelector("p").textContent)
const searchBox = () => screen.getByRole("searchbox")
const cancelButton = (name) => screen.getByRole("button", { name: `${name}에게 보낸 친구 신청 취소` })

// 친구 추가 탭을 엶 (검색 전) → 가짜 HTTP
async function openAddTab(routes = {}) {
  signIn()
  const http = installFetch({ [`GET ${OUT}`]: { body: { data: SENT } }, ...routes })
  await openPanel()
  await openTab("친구 추가")
  return http
}

// 소켓 알림 받기만 붙인 빈 화면 (패널과 같이 띄움)
function Listener({ socket }) {
  useFriendSocketEvents(socket)
  return null
}
async function withSocket() {
  const socket = fakeSocket({ connected: false })
  await act(async () => { render(React.createElement(Listener, { socket })); await settle() })
  return socket
}

test("A13-F-501 친구 추가 탭(검색 전) → 보낸 신청 2줄이 서버가 준 차례대로, 목록 요청 1번", async () => {
  const http = await openAddTab()
  assert.deepEqual(sentNames(), ["지유", "가람"])
  assert.equal(http.to("GET", OUT).length, 1)
  assert.ok(screen.getByRole("list", { name: "보낸 친구 신청" }))
})

test("A13-F-502 취소 단추 읽기 이름 \"지유에게 보낸 친구 신청 취소\", 보이는 글 \"취소\"", async () => {
  await openAddTab()
  const button = within(sentRow(31)).getByRole("button", { name: "지유에게 보낸 친구 신청 취소" })
  assert.equal(button.textContent, "취소")
})

test("A13-F-503 지유 줄 취소 → PUT /friends/requests/31/cancel 1번, 성공 뒤 지유 줄 없음·가람 줄 그대로", async () => {
  let cancelled = false
  const http = await openAddTab({
    [`GET ${OUT}`]: () => ({ body: { data: cancelled ? [SENT[1]] : SENT } }),
    "PUT /friends/requests/31/cancel": () => { cancelled = true; return { body: { data: { request_id: 31, status: "CANCELLED" } } } },
  })
  await press(cancelButton("지유"))
  assert.equal(http.to("PUT", "/friends/requests/31/cancel").length, 1)
  assert.deepEqual(sentNames(), ["가람"])
})

test("A13-F-504 취소 답 오기 전에 또 누름 → 요청 1번, 그동안 단추 꺼짐", async () => {
  const http = await openAddTab({ "PUT /friends/requests/31/cancel": HOLD })
  const button = cancelButton("지유")
  await press(button)
  assert.equal(within(sentRow(31)).getByRole("button").disabled, true)
  await press(within(sentRow(31)).getByRole("button"))
  assert.equal(http.to("PUT", "/friends/requests/31/cancel").length, 1)
  await http.release("PUT", "/friends/requests/31/cancel", { body: { data: { request_id: 31, status: "CANCELLED" } } })
})

test("A13-F-505 취소 실패(500) → 지유 줄 안에만 \"취소하지 못했습니다. 다시 시도해 주세요.\", 줄은 남음", async () => {
  await openAddTab({ "PUT /friends/requests/31/cancel": { status: 500, body: { message: "서버 오류" } } })
  await press(cancelButton("지유"))
  assert.equal(within(sentRow(31)).getByRole("alert").textContent, "취소하지 못했습니다. 다시 시도해 주세요.")
  assert.equal(within(sentRow(32)).queryByRole("alert"), null)
  assert.deepEqual(sentNames(), ["지유", "가람"])
})

test("A13-F-506 이미 답이 온 신청 취소(409) → 보낸 신청을 다시 받아 그 줄이 사라짐", async () => {
  let answered = false
  const http = await openAddTab({
    [`GET ${OUT}`]: () => ({ body: { data: answered ? [SENT[1]] : SENT } }),
    "PUT /friends/requests/31/cancel": () => { answered = true; return { status: 409, body: { message: "이미 처리된 요청입니다." } } },
  })
  await press(cancelButton("지유"))
  assert.equal(http.to("GET", OUT).length, 2)
  assert.deepEqual(sentNames(), ["가람"])
})

test("A13-F-507 보낸 신청 0개 → 줄도 \"보낸 신청\" 머리 글도 없음", async () => {
  await openAddTab({ [`GET ${OUT}`]: { body: { data: [] } } })
  assert.equal(sentRows().length, 0)
  assert.equal(screen.queryByRole("list", { name: "보낸 친구 신청" }), null)
  assert.equal(screen.queryByText(/보낸 신청/), null)
})

test("A13-F-508 보낸 신청 받기 실패 → 서버 글이 role=status로 보임, 줄 없음", async () => {
  await openAddTab({ [`GET ${OUT}`]: { status: 500, body: { message: "보낸 신청 오류" } } })
  assert.equal(document.querySelector("[data-outgoing-list-error]")?.textContent, "보낸 신청 오류")
  assert.equal(document.querySelector("[data-outgoing-list-error]")?.getAttribute("role"), "status")
  assert.equal(sentRows().length, 0)
})

test("A13-F-509 서버 글 없는 받기 실패 → \"보낸 친구 신청을 불러오지 못했습니다.\"", async () => {
  await openAddTab({ [`GET ${OUT}`]: { status: 500, body: {} } })
  assert.equal(document.querySelector("[data-outgoing-list-error]")?.textContent, "보낸 친구 신청을 불러오지 못했습니다.")
})

test("A13-F-510 검색을 누르면 보낸 신청 줄을 숨기고 결과만, 검색어를 지우면 다시 보임", async () => {
  await openAddTab({ "GET /friends/search": { body: { data: [{ id: "c-a", name: "다솜", status: "ONLINE" }] } } })
  await typeInto(searchBox(), "다")
  await act(async () => { fireEvent.keyDown(searchBox(), { key: "Enter", code: "Enter" }); await settle(8) })
  assert.equal(sentRows().length, 0)
  assert.equal(document.querySelectorAll("li[data-candidate-id]").length, 1)
  await typeInto(searchBox(), "")
  assert.deepEqual(sentNames(), ["지유", "가람"])
})

test("A13-F-511 검색 결과에서 신청을 보냄 → 보낸 신청 목록을 다시 받음, 검색어를 지우면 새 줄이 보임", async () => {
  let sent = false
  const dasom = { request_id: 33, id: "c-a", name: "다솜", created_at: "2026-11-16T03:00:00.000Z" }
  const http = await openAddTab({
    [`GET ${OUT}`]: () => ({ body: { data: sent ? [dasom, ...SENT] : SENT } }),
    "GET /friends/search": { body: { data: [{ id: "c-a", name: "다솜", status: "ONLINE" }] } },
    "POST /friends/requests": () => { sent = true; return { body: { message: "친구 신청을 보냈습니다." } } },
  })
  await typeInto(searchBox(), "다")
  await act(async () => { fireEvent.keyDown(searchBox(), { key: "Enter", code: "Enter" }); await settle(8) })
  await press(screen.getByRole("button", { name: "다솜에게 친구 신청" }))
  assert.equal(http.to("GET", OUT).length, 2)
  await typeInto(searchBox(), "")
  assert.deepEqual(sentNames(), ["다솜", "지유", "가람"])
})

test("A13-F-512 취소한 사람을 다시 검색 → 단추 이름이 \"신청 완료\"가 아니라 \"다솜에게 친구 신청\"", async () => {
  let state = "none"
  const dasom = { request_id: 33, id: "c-a", name: "다솜", created_at: "2026-11-16T03:00:00.000Z" }
  await openAddTab({
    [`GET ${OUT}`]: () => ({ body: { data: state === "sent" ? [dasom] : [] } }),
    "GET /friends/search": { body: { data: [{ id: "c-a", name: "다솜", status: "ONLINE" }] } },
    "POST /friends/requests": () => { state = "sent"; return { body: { message: "친구 신청을 보냈습니다." } } },
    "PUT /friends/requests/33/cancel": () => { state = "cancelled"; return { body: { data: { request_id: 33, status: "CANCELLED" } } } },
  })
  const search = async () => {
    await typeInto(searchBox(), "다")
    await act(async () => { fireEvent.keyDown(searchBox(), { key: "Enter", code: "Enter" }); await settle(8) })
  }
  await search()
  await press(screen.getByRole("button", { name: "다솜에게 친구 신청" }))
  assert.ok(screen.getByRole("button", { name: "신청 완료" }))
  await typeInto(searchBox(), "")
  await press(cancelButton("다솜"))
  await search()
  assert.ok(screen.getByRole("button", { name: "다솜에게 친구 신청" }))
  assert.equal(screen.queryByRole("button", { name: "신청 완료" }), null)
})

// A13-F-513~514 상대가 답하면 보낸 신청 줄이 바로 사라짐
for (const [no, label, event] of [
  ["A13-F-513", "받아짐", "friend_request_accepted"],
  ["A13-F-514", "거절됨", "friend_request_declined"],
]) {
  test(`${no} 지유에게 보낸 신청이 ${label}(${event}) → 지유 줄 사라짐, 가람 줄 그대로`, async () => {
    await openAddTab()
    const socket = await withSocket()
    await say(socket, event, { byUuid: "u-jy" })
    assert.deepEqual(sentNames(), ["가람"])
  })
}

test("A13-F-515 받은 쪽: 상대가 신청을 취소(friend_relation_invalidated REQUEST_CANCELLED) → 받은 신청을 다시 받아 그 줄이 사라짐", async () => {
  signIn()
  let cancelled = false
  const incoming = [{ request_id: 41, id: "u-ms", name: "민수" }, { request_id: 42, id: "u-na", name: "나래" }]
  const http = installFetch({
    "GET /friends/requests/incoming": () => ({ body: { data: cancelled ? [incoming[1]] : incoming } }),
  })
  await openPanel()
  await openTab("요청 수락")
  const names = () => [...document.querySelectorAll("li[data-request-id]")].map((li) => li.querySelector("p").textContent)
  assert.deepEqual(names(), ["민수", "나래"])
  const socket = await withSocket()
  const before = http.to("GET", "/friends/requests/incoming").length
  cancelled = true
  await say(socket, "friend_relation_invalidated", { reason: "REQUEST_CANCELLED" })
  assert.equal(http.to("GET", "/friends/requests/incoming").length, before + 1)
  assert.deepEqual(names(), ["나래"])
})

test("A13-F-516 보낸 신청 목록을 연 뒤 관계 바뀜 사건(상대가 나를 차단) → 보낸 신청도 다시 받아 그 줄이 사라짐", async () => {
  let blocked = false
  const http = await openAddTab({ [`GET ${OUT}`]: () => ({ body: { data: blocked ? [SENT[1]] : SENT } }) })
  const socket = await withSocket()
  blocked = true
  await say(socket, "friend_relation_invalidated", { reason: "BLOCKED" })
  assert.equal(http.to("GET", OUT).length, 2)
  assert.deepEqual(sentNames(), ["가람"])
})
