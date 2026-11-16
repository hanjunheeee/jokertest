// 탈주 대기 거절 시험(화면 상태): 방 만들기·코드 입장·공개 방·초대 수락·빠른 매칭 다섯 길에서 서버 글 그대로 보일 글이 되고, 거절 뒤 다시 누를 수 있음
// 목록 A09-끊김-나가기-탈주.md A09-F-148~157, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/desertion-reject.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { useNavigate } = await import("react-router-dom")
const { useCreateRoom } = await import("../../src/domains/game/setup/hooks/useCreateRoom.js")
const { useRoomInvitePage } = await import("../../src/domains/game/mode/hooks/useRoomInvitePage.js")
const { usePublicRooms } = await import("../../src/domains/game/mode/hooks/usePublicRooms.js")
const { useMatchmakingSearch } = await import("../../src/domains/game/mode/hooks/useMatchmakingSearch.js")
const { getSocket, subscribeSocket } = await import("../../src/shared/socket/socketClient.js")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { usePanelInvites } = await import("../../src/domains/lobby/hooks/friendPanel/usePanelInvites.js")
const { default: GameInviteTab } = await import("../../src/domains/lobby/components/friendList/invite/GameInviteTab.jsx")
const { useGameInviteStore } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { useFriendStore } = await import("../../src/domains/lobby/store/friend.store.js")

const h = K.h

test.afterEach(() => {
  K.reset()
  useGameInviteStore.getState().__resetForTests?.()
  useFriendStore.getState().__resetForTests?.()
})

// 서버 거절 (backend/tests/flow/a09-desertion-block.test.js 모양: 코드 + 글 + 남은 ms + 막힘 끝 시각)
const COOLDOWN_TEXT = "탈주로 4분 59초 뒤에 참여할 수 있습니다."
const REFUSAL = {
  ok: false,
  code: "DESERTION_COOLDOWN",
  message: COOLDOWN_TEXT,
  retryAfterMs: 299_000,
  blockedUntil: new Date(Date.now() + 299_000).toISOString(),
}
// 입장 실패 알림(room_join_failed)엔 ok 칸이 없음
const BROADCAST_REFUSAL = { code: REFUSAL.code, message: REFUSAL.message, retryAfterMs: REFUSAL.retryAfterMs, blockedUntil: REFUSAL.blockedUntil }

// 훅 값만 꺼내는 작은 화면
function HookProbe({ useHook, api }) {
  api.current = useHook()
  return null
}
async function renderHookAt(path, useHook) {
  const api = { current: null }
  await K.renderRoutes({ path, element: h(HookProbe, { useHook, api }) })
  return api
}

// 방 만들기 값 (처음 값 그대로)
const SETTINGS = { accessType: "open", maxPlayers: 10, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, roleCompositionMode: "auto" }

// 다섯 길: 거절을 받기까지 하고 { text, pending, path } 를 돌려줌
const PATHS = {
  async "방 만들기"() {
    const fake = K.signIn()
    fake.answer("create_room", REFUSAL)
    const api = await renderHookAt("/game-setup", () => {
      const navigate = useNavigate()
      const accountId = K.useAuthStore((s) => s.user?.uuid ?? null)
      const identityGeneration = K.useAuthStore((s) => s.identityGeneration)
      return useCreateRoom({ navigate, accountId, identityGeneration })
    })
    await K.RTL.act(async () => { await api.current.createGame(SETTINGS) })
    await K.flush()
    return { text: K.dialogs.alerts.at(-1) ?? null, pending: api.current.isCreating, where: K.path(), home: "/game-setup", sent: fake.sentOf("create_room").length }
  },
  async "코드 입장"() {
    const fake = K.signIn()
    const api = await renderHookAt("/roomInvite", useRoomInvitePage)
    K.RTL.act(() => api.current.setRoomCode("ABC234"))
    K.RTL.act(() => api.current.joinRoom())
    await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
    await K.flush()
    return { text: K.dialogs.alerts.at(-1) ?? null, pending: api.current.isJoining, where: K.path(), home: "/roomInvite", sent: fake.sentOf("join_room_by_code").length }
  },
  async "공개 방 입장"() {
    const fake = K.signIn()
    fake.answer("get_public_rooms", { ok: true, rooms: [{ id: "room-1", title: "봄의 방", current: 3, max: 6, accessType: "open", status: "waiting" }] })
    const api = await renderHookAt("/multiplay", usePublicRooms)
    K.RTL.act(() => api.current.joinPublicRoom("room-1"))
    await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
    await K.flush()
    return { text: K.dialogs.alerts.at(-1) ?? null, pending: api.current.isJoining, where: K.path(), home: "/multiplay", sent: fake.sentOf("join_public_room").length }
  },
  async "초대 수락"() {
    const { fake, row, acceptButton } = await openInviteTab()
    fake.answer("accept_game_invite", REFUSAL)
    await K.click(acceptButton())
    await K.flush(20)
    const error = row()?.querySelector("[data-invite-error]")?.textContent ?? null
    return { text: error, pending: acceptButton().disabled, where: K.path(), home: "/lobby", sent: fake.sentOf("accept_game_invite").length }
  },
  async "빠른 매칭"() {
    const fake = K.signIn()
    const api = await renderHookAt("/gameMode", useMatchmakingSearch)
    K.RTL.act(() => api.current.startQuickMatch())
    assert.equal(api.current.isSearching, true, "찾는 중이 켜짐")
    await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
    await K.flush()
    return { text: K.dialogs.alerts.at(-1) ?? null, pending: api.current.isSearching, where: K.path(), home: "/gameMode", sent: fake.sent.filter((s) => s.event === "join_matchmaking").length }
  },
}

// 받은 초대 한 줄 (서버 모양, 3분 뒤 끝남)
const INVITE = {
  inviteId: "inv-a09", receiverId: "a09-me", senderId: "a09-sender", senderName: "보낸친구",
  roomId: "room-1", status: "PENDING", revision: 1, creationSeq: "5",
  expiresAt: new Date(Date.now() + 180_000).toISOString(),
}

// 로비 친구 창의 받은 초대 탭 (친구 소켓 사건 받기 + 패널 초대 값)
function LobbyInviteTab() {
  const navigate = useNavigate()
  const socket = K.React.useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  useFriendSocketEvents(socket, { navigate })
  const { inviteList } = usePanelInvites({ open: false, roomId: null, isRoomVerified: false })
  return h(GameInviteTab, { ...inviteList, onBack: () => {} })
}
async function openInviteTab() {
  const fake = K.signIn({ connected: false })
  K.fetchRoutes["GET /friends/invites"] = { body: { data: { invites: [INVITE], cursor: "0" } } }
  useGameInviteStore.getState().syncAccount()
  useGameInviteStore.setState({ status: "success", snapshotLoaded: true })
  await K.renderRoutes({ path: "/lobby", element: h(LobbyInviteTab), routes: { "/game-matching": h("p", null, "대기방 화면") } })
  await K.RTL.act(async () => { fake.fire("game_invite_received", { invite: INVITE, sfxEvent: null }) })
  await K.flush(10)
  fake.connected = true
  const row = () => document.querySelector('[data-invite-id="inv-a09"]')
  const acceptButton = () => K.RTL.within(row()).getByRole("button", { name: /초대 수락/ })
  return { fake, row, acceptButton }
}

const NAMES = ["방 만들기", "코드 입장", "공개 방 입장", "초대 수락", "빠른 매칭"]

// 보일 글 = 서버 글 (값 5)
NAMES.forEach((name, i) => {
  test(`A09-F-${148 + i} ${name} 거절 DESERTION_COOLDOWN → 보일 글 = "${COOLDOWN_TEXT}"`, async () => {
    const got = await PATHS[name]()
    assert.equal(got.sent, 1, "요청이 한 번 나감")
    assert.equal(got.text, COOLDOWN_TEXT)
  })
})

// 거절 뒤 다시 누를 수 있음 (값 5): "만드는 중·들어가는 중" 꺼짐, 같은 화면
NAMES.forEach((name, i) => {
  test(`A09-F-${153 + i} ${name} 거절 뒤 → 진행 중 표시 꺼짐, 같은 화면에 머묾`, async () => {
    const got = await PATHS[name]()
    assert.equal(got.pending, false, "진행 중 표시가 남음")
    assert.equal(got.where, got.home)
  })
})
