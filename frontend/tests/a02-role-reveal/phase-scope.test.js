// 역할 확인 단계에 되는 것·안 되는 것과 시작 알림 → 판 화면 이동 시험: 채팅·이모티콘·투표·준비, 대기방에서 game_started 받기 (화면 상태)
// 목록 A02-F-116~120 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import {
  LocationText, React, RTL, installSocket, loginAs, renderActionContext, resetAll,
  useInGameStore,
} from "./a02Render.mjs"
import { autoCounts, buildGameStarted, firstOf, nextGameId, seatPlayers } from "./a02Fixtures.mjs"

const { selectOwnedGameChatContext } = await import("../../src/domains/game/ingame/utils/selectOwnedGameChatContext.js")
const { isInGameEmojiPhase } = await import("../../src/domains/game/ingame/utils/selectInGameEmojiScope.js")
const { useInGameEmojiSend } = await import("../../src/domains/game/ingame/hooks/useInGameEmojiSend.js")
const { buildInGamePlayerCardMenuItems, INGAME_CARD_MENU_ITEM_KINDS: KINDS } = await import(
  "../../src/domains/game/ingame/hooks/useInGamePlayerCardMenu.js"
)
const { useMatchingPage } = await import("../../src/domains/game/matching/hooks/useMatchingPage.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { resetInGameNavigationDedupe } = await import("../../src/domains/game/matching/utils/navigateToInGame.js")
const { registerMatchingRouterNavigate } = await import("../../src/domains/game/matching/utils/matchingRouterNavigate.js")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
const h = React.createElement

test.afterEach(() => {
  resetAll()
  useMatchingStore.getState().clearRoom()
  resetInGameNavigationDedupe()
  registerMatchingRouterNavigate(null)
  window.history.replaceState(null, "", "/")
})

// 6명 판 의사로 시작 알림까지 (역할 확인 단계, 산 사람)
const SEATS = seatPlayers(autoCounts(6), { gameTag: "scope" })
const ME = firstOf(SEATS, "DOCTOR")
function inRoleReveal() {
  installSocket()
  loginAs(ME)
  const gameId = nextGameId("scope")
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(SEATS, ME, { gameId })) })
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
  return gameId
}

test("A02-F-116 역할 확인 단계 산 사람 → 채팅 쓸 수 없음(보낼 채널 없음)", () => {
  inRoleReveal()
  const chat = selectOwnedGameChatContext(useInGameStore.getState(), ME.uuid)
  assert.ok(chat.gameId, "내 판 문맥은 있음")
  assert.equal(chat.sendChannel, null)
})

// 결정 2026-11-16 오전 둘째 "이모티콘": 낮에만 → 역할 확인 10초 동안은 안 됨 (서버도 INVALID_PHASE로 거절)
test("A02-F-117 역할 확인 단계 산 사람 → 이모티콘 못 씀: 보내기를 불러도 send_emoji가 안 나감", async () => {
  const socket = installSocket()
  loginAs(ME)
  const gameId = nextGameId("scope")
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(SEATS, ME, { gameId })) })
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
  assert.equal(isInGameEmojiPhase(useInGameStore.getState().state), false)
  // 이모티콘 보내기 훅을 직접 불러도 요청이 안 나가고 "못 보냄"으로 답함
  const hook = RTL.renderHook(() => useInGameEmojiSend())
  const result = await hook.result.current.send("emoji-basic-hello")
  assert.equal(result.ok, false)
  assert.equal(socket.sent.some((s) => s.event === "send_emoji"), false)
})

test("A02-F-118 역할 확인 단계 → 판 단추 줄에 투표·준비 없음", () => {
  inRoleReveal()
  const sink = renderActionContext()
  assert.equal(sink.ctx.dayVoteControlsEnabled, false)
  assert.equal(sink.ctx.dayReadyControlsEnabled, false)
  // 남의 카드 메뉴에 투표 항목 없음
  for (const other of SEATS.filter((p) => p.uuid !== ME.uuid)) {
    const kinds = buildInGamePlayerCardMenuItems(sink.ctx, other.uuid, ME.uuid).map((i) => i.kind)
    assert.equal(kinds.includes(KINDS.DAY_VOTE), false, other.uuid)
    assert.equal(kinds.includes(KINDS.DAY_VOTE_CANCEL), false, other.uuid)
  }
})

// 대기방 화면 값만 쓰는 작은 화면 (방에 있음 글)
function RoomProbe() {
  const page = useMatchingPage()
  return h("p", null, page.isRoomVerified ? "대기방 확인됨" : "대기방")
}

// 방에 앉아 대기방 화면을 그림 (주소 /game-matching), /ingame 으로 가면 주소 글을 보임
// 앱처럼 데이터 라우터를 쓰고 그 라우터의 navigate를 대기방 이동 함수(matchingRouterNavigate)에 끼움
// 대기방→판 이동은 브라우저 주소(window.location)가 /game-matching일 때만 함 → jsdom 주소도 맞춤
function mountWaitingRoom() {
  window.history.replaceState(null, "", "/game-matching")
  const socket = installSocket()
  loginAs(ME)
  RTL.act(() => {
    useMatchingStore.getState().setRoom({
      roomId: "room-a02", roomCode: "AB12", hostUuid: SEATS[0].uuid,
      players: SEATS.map((p) => ({ uuid: p.uuid, nickname: p.nickname, isReady: true })),
    })
  })
  const router = createMemoryRouter([
    { path: "/game-matching", element: h(RoomProbe) },
    { path: "*", element: h(LocationText) },
  ], { initialEntries: ["/game-matching"] })
  registerMatchingRouterNavigate((to, options) => router.navigate(to, options))
  RTL.render(h(RouterProvider, { router }))
  return socket
}

test("A02-F-119 대기방 화면에서 game_started → 판 화면 주소(/ingame)로 감", () => {
  const socket = mountWaitingRoom()
  assert.ok(RTL.screen.queryByText(/대기방/) !== null, "대기방 화면")
  const payload = buildGameStarted(SEATS, ME, { gameId: nextGameId("start") })
  RTL.act(() => { socket.trigger("game_started", payload) })
  assert.equal(RTL.screen.getByTestId("location").textContent, "/ingame")
})

test("A02-F-120 game_started.gameId → 판 화면 판 id 같음", () => {
  const socket = mountWaitingRoom()
  const gameId = nextGameId("start")
  RTL.act(() => { socket.trigger("game_started", buildGameStarted(SEATS, ME, { gameId })) })
  assert.equal(useInGameStore.getState().gameId, gameId)
  assert.equal(useInGameStore.getState().state.id, gameId)
})
