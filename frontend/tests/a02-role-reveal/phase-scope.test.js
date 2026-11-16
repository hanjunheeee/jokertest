// 역할 확인 단계에 되는 것·안 되는 것과 시작 알림 → 판 화면 이동 시험: 채팅·이모티콘·투표·준비, 대기방에서 game_started 받기 (화면 상태)
// 목록 A02-F-116~120 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import {
  LocationText, MemoryRouter, React, RTL, Route, Routes, installSocket, loginAs, renderActionContext, resetAll,
  useAuthStore, useInGameStore,
} from "./a02Render.mjs"
import { autoCounts, buildGameStarted, firstOf, nextGameId, seatPlayers } from "./a02Fixtures.mjs"

const { selectOwnedGameChatContext } = await import("../../src/domains/game/ingame/utils/selectOwnedGameChatContext.js")
const { selectInGameEmojiScope } = await import("../../src/domains/game/ingame/utils/selectInGameEmojiScope.js")
const { buildInGamePlayerCardMenuItems, INGAME_CARD_MENU_ITEM_KINDS: KINDS } = await import(
  "../../src/domains/game/ingame/hooks/useInGamePlayerCardMenu.js"
)
const { useMatchingPage } = await import("../../src/domains/game/matching/hooks/useMatchingPage.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const h = React.createElement

test.afterEach(() => {
  resetAll()
  useMatchingStore.getState().clearRoom()
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

test("A02-F-117 역할 확인 단계 산 사람 → 이모티콘 쓸 수 있음", () => {
  const gameId = inRoleReveal()
  const auth = useAuthStore.getState()
  const scope = selectInGameEmojiScope(useInGameStore.getState(), auth.user.uuid, auth.identityGeneration)
  assert.notEqual(scope, null)
  assert.equal(scope.gameId, gameId)
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

// 방에 앉아 대기방 화면을 그림 (주소 /room), /ingame 으로 가면 주소 글을 보임
function mountWaitingRoom() {
  const socket = installSocket()
  loginAs(ME)
  RTL.act(() => {
    useMatchingStore.getState().setRoom({
      roomId: "room-a02", roomCode: "AB12", hostUuid: SEATS[0].uuid,
      players: SEATS.map((p) => ({ uuid: p.uuid, nickname: p.nickname, isReady: true })),
    })
  })
  RTL.render(
    h(MemoryRouter, { initialEntries: ["/room"] },
      h(Routes, null,
        h(Route, { path: "/room", element: h(RoomProbe) }),
        h(Route, { path: "/ingame", element: h(LocationText) }),
      ),
    ),
  )
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
