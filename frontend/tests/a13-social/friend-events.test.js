// 친구 소켓 알림을 받았을 때 화면 값·다시 받기 요청 시험 (접속 바뀜·신청 받음·받아짐·거절됨·관계 바뀜·다시 접속)
// 목록 A13-F-001~006 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-events.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, act } = await import("@testing-library/react")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { useFriendStore } = await import("../../src/domains/lobby/store/friend.store.js")
const { installFetch, fakeSocket, say, signIn, resetAll, settle, friend } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 소켓 알림 받기만 붙인 빈 화면
function Listener({ socket }) {
  useFriendSocketEvents(socket)
  return null
}

// 연결 전 소켓으로 붙임 (붙일 때 바로 다시 받기가 안 나가게)
async function mount(routes = {}) {
  signIn()
  const http = installFetch(routes)
  const socket = fakeSocket({ connected: false })
  await act(async () => { render(React.createElement(Listener, { socket })); await settle() })
  return { http, socket }
}

// 친구 셋 (A 접속 안 함·B 접속 안 함·C 접속 중)
const THREE = [friend("fa", "가람", false), friend("fb", "나래", false), friend("fc", "다솜", true)]

test("A13-F-001 친구 3명 + B 접속 → B 줄만 접속 중, A·C 그대로", async () => {
  const { socket } = await mount({ "GET /friends": { body: { data: THREE } } })
  await act(async () => { await useFriendStore.getState().fetchFriends() })
  await say(socket, "friend_status_change", { uuid: "fb", status: "ONLINE" })
  const rows = useFriendStore.getState().friends.map((f) => `${f.id}:${f.online}`)
  assert.deepEqual(rows, ["fa:false", "fb:true", "fc:true"])
})

test("A13-F-002 친구 신청 받음 → 받은 신청 목록 요청 1번", async () => {
  const { http, socket } = await mount()
  await say(socket, "friend_request_received", { requestId: 7 })
  assert.equal(http.to("GET", "/friends/requests/incoming").length, 1)
})

test("A13-F-003 내 신청이 받아짐 → 친구 목록 요청 1번, B 신청 완료 표시 지움", async () => {
  const { http, socket } = await mount()
  useFriendStore.getState().addSentRequest("fb")
  await say(socket, "friend_request_accepted", { byUuid: "fb" })
  assert.equal(http.to("GET", "/friends").length, 1)
  assert.equal(useFriendStore.getState().sentRequestIds.has("fb"), false)
})

test("A13-F-004 내 신청이 거절됨 → B 표시 지움, 친구 목록 요청 0번", async () => {
  const { http, socket } = await mount()
  useFriendStore.getState().addSentRequest("fb")
  await say(socket, "friend_request_declined", { byUuid: "fb" })
  assert.equal(useFriendStore.getState().sentRequestIds.has("fb"), false)
  assert.equal(http.to("GET", "/friends").length, 0)
})

test("A13-F-005 관계 바뀜 → 친구·받은 신청·차단·초대 목록 요청 1번씩", async () => {
  const { http, socket } = await mount()
  await say(socket, "friend_relation_invalidated", { reason: "BLOCKED" })
  const counts = ["/friends", "/friends/requests/incoming", "/friends/blocks", "/friends/invites"]
    .map((path) => `${path}=${http.to("GET", path).length}`)
  assert.deepEqual(counts, ["/friends=1", "/friends/requests/incoming=1", "/friends/blocks=1", "/friends/invites=1"])
})

test("A13-F-006 다시 접속(connect) → 친구·받은 신청·즐겨찾기·초대 목록 요청", async () => {
  const { http, socket } = await mount()
  await say(socket, "connect", undefined)
  const counts = ["/friends", "/friends/requests/incoming", "/friends/favorites", "/friends/invites"]
    .map((path) => `${path}=${http.to("GET", path).length}`)
  assert.deepEqual(counts, ["/friends=1", "/friends/requests/incoming=1", "/friends/favorites=1", "/friends/invites=1"])
})
