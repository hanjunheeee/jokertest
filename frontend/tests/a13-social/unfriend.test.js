// 친구 끊기 화면 시험 (친구 줄 끊기 단추·한 번 확인·확인 뒤 요청·취소·두 번 누름·실패 글·즐겨찾기 풀림·실시간으로 사라짐·대기방 창엔 없음)
// 목록 A13-F-521~534 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md "친구 신청 취소·친구 끊기" 장), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/unfriend.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, within, act, render } = await import("@testing-library/react")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const {
  installFetch, fakeSocket, say, signIn, resetAll, friend, openPanel, press, settle, HOLD,
} = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

const rowOf = (id) => document.querySelector(`li[data-friend-id="${id}"]`)
const buttonNames = (row) => within(row).getAllByRole("button").map((b) => b.getAttribute("aria-label"))
const folderLabels = () => [...document.querySelectorAll("button[aria-expanded] span")].map((el) => el.textContent)

// 접속한 친구 둘(가람·나래)이 보이는 친구 창 → 가짜 HTTP
async function openWithFriends(routes = {}, panelProps = {}) {
  signIn()
  const http = installFetch({
    "GET /friends": { body: { data: [friend("f1", "가람", true), friend("f2", "나래", true)] } },
    ...routes,
  })
  await openPanel(panelProps)
  return http
}

// 소켓 알림 받기만 붙인 빈 화면 (패널과 같이 띄움)
function Listener({ socket }) {
  useFriendSocketEvents(socket)
  return null
}

// 가람 줄에서 끊기 → 확인까지 누름
async function unfriendGaram() {
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기 확인" }))
}

test("A13-F-521 친구 줄에 \"가람 친구 끊기\" 단추, 보이는 글 \"끊기\"", async () => {
  await openWithFriends()
  const button = within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" })
  assert.equal(button.textContent, "끊기")
})

test("A13-F-522 끊기를 한 번 누름 → 요청 0번, \"친구를 끊을까요?\" 글과 \"끊기 확인\"·\"끊기 취소\" 단추", async () => {
  const http = await openWithFriends()
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  assert.equal(http.to("DELETE", "/friends/f1").length, 0)
  assert.equal(rowOf("f1").querySelector("[data-unfriend-confirm]")?.textContent, "친구를 끊을까요?")
  assert.equal(rowOf("f1").querySelector("[data-unfriend-confirm]")?.getAttribute("role"), "status")
  assert.ok(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기 확인" }))
  assert.ok(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기 취소" }))
})

test("A13-F-523 확인을 누름 → DELETE /friends/f1 1번, 성공 뒤 가람 줄 없음·나래 줄 그대로", async () => {
  let gone = false
  const http = await openWithFriends({
    "GET /friends": () => ({ body: { data: gone ? [friend("f2", "나래", true)] : [friend("f1", "가람", true), friend("f2", "나래", true)] } }),
    "DELETE /friends/f1": () => { gone = true; return { body: { data: { unfriendedId: "f1", cancelledInvites: [] } } } },
  })
  await unfriendGaram()
  assert.equal(http.to("DELETE", "/friends/f1").length, 1)
  assert.equal(rowOf("f1"), null)
  assert.ok(rowOf("f2"))
})

test("A13-F-524 확인 대신 취소를 누름 → 요청 0번, 묻는 글이 사라지고 처음 단추로 돌아옴", async () => {
  const http = await openWithFriends()
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기 취소" }))
  assert.equal(http.to("DELETE", "/friends/f1").length, 0)
  assert.equal(rowOf("f1").querySelector("[data-unfriend-confirm]"), null)
  assert.ok(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
})

test("A13-F-525 끊기 단추 자리를 잇달아 두 번 누름 → 요청 0번 (두 번째 누름은 취소)", async () => {
  const http = await openWithFriends()
  const spot = within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" })
  await press(spot)
  await press(spot)
  assert.equal(http.to("DELETE", "/friends/f1").length, 0)
  assert.equal(rowOf("f1").querySelector("[data-unfriend-confirm]"), null)
})

test("A13-F-526 확인 답 오기 전에 또 누름 → 요청 1번, 그동안 그 줄 끊기 단추 꺼짐", async () => {
  const http = await openWithFriends({ "DELETE /friends/f1": HOLD })
  await unfriendGaram()
  const busy = within(rowOf("f1")).getAllByRole("button").filter((b) => /친구 끊/.test(b.getAttribute("aria-label")))
  assert.ok(busy.length > 0)
  for (const button of busy) {
    assert.equal(button.disabled, true)
    await press(button)
  }
  assert.equal(http.to("DELETE", "/friends/f1").length, 1)
  await http.release("DELETE", "/friends/f1", { body: { data: { unfriendedId: "f1", cancelledInvites: [] } } })
})

test("A13-F-527 끊기 실패(서버 글 없는 500) → 가람 줄에 \"친구를 끊지 못했습니다.\", 줄은 남고 나래 줄엔 글 없음", async () => {
  await openWithFriends({ "DELETE /friends/f1": { status: 500, body: {} } })
  await unfriendGaram()
  assert.equal(rowOf("f1").querySelector("[data-unfriend-error]")?.textContent, "친구를 끊지 못했습니다.")
  assert.equal(rowOf("f2").querySelector("[data-unfriend-error]"), null)
  assert.ok(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
})

test("A13-F-528 끊기 실패에 서버 글이 있음(403 \"권한이 없습니다.\") → 그 글 그대로", async () => {
  await openWithFriends({ "DELETE /friends/f1": { status: 403, body: { message: "권한이 없습니다." } } })
  await unfriendGaram()
  assert.equal(rowOf("f1").querySelector("[data-unfriend-error]")?.textContent, "권한이 없습니다.")
})

test("A13-F-529 이미 친구가 아님(404) → 친구 목록을 다시 받아 그 줄이 사라짐", async () => {
  let gone = false
  const http = await openWithFriends({
    "GET /friends": () => ({ body: { data: gone ? [friend("f2", "나래", true)] : [friend("f1", "가람", true), friend("f2", "나래", true)] } }),
    "DELETE /friends/f1": () => { gone = true; return { status: 404, body: { message: "친구가 아닌 사용자입니다." } } },
  })
  const before = http.to("GET", "/friends").length
  await unfriendGaram()
  assert.equal(http.to("GET", "/friends").length, before + 1)
  assert.equal(rowOf("f1"), null)
})

test("A13-F-530 즐겨찾기한 친구를 끊음 → 즐겨찾기 폴더가 \"즐겨찾기 (0)\"", async () => {
  let gone = false
  await openWithFriends({
    "GET /friends": () => ({ body: { data: gone ? [] : [friend("f1", "가람", true)] } }),
    "GET /friends/favorites": () => ({ body: { data: gone ? [] : ["f1"] } }),
    "DELETE /friends/f1": () => { gone = true; return { body: { data: { unfriendedId: "f1", cancelledInvites: [] } } } },
  })
  assert.ok(folderLabels().includes("즐겨찾기 (1)"), `폴더 이름: ${folderLabels().join(", ")}`)
  const folder = screen.getAllByRole("button").find((b) => b.textContent.startsWith("즐겨찾기 ("))
  if (!rowOf("f1")) await press(folder)
  await unfriendGaram()
  assert.ok(folderLabels().includes("즐겨찾기 (0)"), `폴더 이름: ${folderLabels().join(", ")}`)
  assert.equal(rowOf("f1"), null)
})

test("A13-F-531 상대가 나를 끊음(friend_relation_invalidated UNFRIENDED) → 친구 목록을 다시 받아 그 줄이 사라짐", async () => {
  let gone = false
  await openWithFriends({
    "GET /friends": () => ({ body: { data: gone ? [friend("f2", "나래", true)] : [friend("f1", "가람", true), friend("f2", "나래", true)] } }),
  })
  const socket = fakeSocket({ connected: false })
  await act(async () => { render(React.createElement(Listener, { socket })); await settle() })
  assert.ok(rowOf("f1"))
  gone = true
  await say(socket, "friend_relation_invalidated", { reason: "UNFRIENDED" })
  assert.equal(rowOf("f1"), null)
  assert.ok(rowOf("f2"))
})

test("A13-F-532 묻는 동안 그 줄엔 확인·취소 두 단추만(차단 단추 숨김), 다른 줄은 그대로", async () => {
  await openWithFriends()
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  const names = buttonNames(rowOf("f1")).filter((name) => !/즐겨찾기/.test(name))
  assert.deepEqual(names, ["가람 친구 끊기 확인", "가람 친구 끊기 취소"])
  assert.ok(within(rowOf("f2")).getByRole("button", { name: "나래 차단" }))
  assert.ok(within(rowOf("f2")).getByRole("button", { name: "나래 친구 끊기" }))
  assert.equal(rowOf("f2").querySelector("[data-unfriend-confirm]"), null)
})

test("A13-F-533 끊기 뒤 다시 실패 없이 누르면 앞 실패 글이 지워짐", async () => {
  let fail = true
  await openWithFriends({
    "GET /friends": () => ({ body: { data: fail ? [friend("f1", "가람", true), friend("f2", "나래", true)] : [friend("f2", "나래", true)] } }),
    "DELETE /friends/f1": () => {
      if (fail) { return { status: 500, body: {} } }
      return { body: { data: { unfriendedId: "f1", cancelledInvites: [] } } }
    },
  })
  await unfriendGaram()
  assert.ok(rowOf("f1").querySelector("[data-unfriend-error]"))
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  assert.equal(rowOf("f1").querySelector("[data-unfriend-error]"), null)
  fail = false
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기 확인" }))
  assert.equal(rowOf("f1"), null)
})

test("A13-F-534 대기방에서 연 친구 창(초대 단추가 있는 창)엔 끊기 단추가 없음 → 초대·차단 두 단추만", async () => {
  await openWithFriends({}, { roomId: "room-1", isRoomVerified: true })
  const names = buttonNames(rowOf("f1")).filter((name) => !/즐겨찾기/.test(name))
  assert.deepEqual(names, ["가람 게임 초대", "가람 차단"])
})
