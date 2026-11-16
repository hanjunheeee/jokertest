// 탈주 거절 글이 그 화면에 보이는지 시험(화면 부품): 방 만들기·코드 입력·공개 방 목록·초대 수락·매칭 화면, 읽기 프로그램이 읽는 칸
// 목록 A09-끊김-나가기-탈주.md A09-F-233~239, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/desertion-reject-page.test.js
// 목록 파일 칸은 desertion-reject.test.jsx지만 상태 시험 desertion-reject.test.js와 이름이 겹쳐 desertion-reject-page로 둠
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { useNavigate } = await import("react-router-dom")
const { default: GameSetupPage } = await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")
const { default: RoomInvitePage } = await import("../../src/domains/game/mode/pages/RoomInvitePage.jsx")
const { default: MultiplayEntryPage } = await import("../../src/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { default: GameModePage } = await import("../../src/domains/game/mode/pages/GameModePage.jsx")
const { getSocket, subscribeSocket } = await import("../../src/shared/socket/socketClient.js")
const { useFriendSocketEvents } = await import("../../src/domains/lobby/hooks/useFriendSocketEvents.js")
const { usePanelInvites } = await import("../../src/domains/lobby/hooks/friendPanel/usePanelInvites.js")
const { default: GameInviteTab } = await import("../../src/domains/lobby/components/friendList/invite/GameInviteTab.jsx")
const { useGameInviteStore } = await import("../../src/domains/lobby/store/gameInvite.store.js")
const { useFriendStore } = await import("../../src/domains/lobby/store/friend.store.js")

const h = K.h
const { screen, within, fireEvent } = K.RTL

test.afterEach(() => {
  K.reset()
  useGameInviteStore.getState().__resetForTests?.()
  useFriendStore.getState().__resetForTests?.()
})

const COOLDOWN_TEXT = "탈주로 4분 59초 뒤에 참여할 수 있습니다."
const REFUSAL = {
  ok: false, code: "DESERTION_COOLDOWN", message: COOLDOWN_TEXT,
  retryAfterMs: 299_000, blockedUntil: new Date(Date.now() + 299_000).toISOString(),
}
// 입장 실패 알림(room_join_failed)엔 ok 칸이 없음
const BROADCAST_REFUSAL = { code: REFUSAL.code, message: REFUSAL.message, retryAfterMs: REFUSAL.retryAfterMs, blockedUntil: REFUSAL.blockedUntil }

// 화면에 보이는 그 글: 브라우저 알림 창 글 또는 화면 칸 글
const shownSomewhere = (text) => K.dialogs.alerts.includes(text) || document.body.textContent.includes(text)
// 읽기 프로그램이 바로 읽는 칸(role=alert·status) 안에 그 글이 있나
const inLiveRegion = (text) => [...document.querySelectorAll('[role="alert"], [role="status"]')].some((el) => el.textContent.includes(text))

// 방 만들기 화면: "게임 만들기" 누름 → create_room 거절
async function rejectOnSetup() {
  const fake = K.signIn()
  fake.answer("create_room", REFUSAL)
  await K.renderRoutes({ path: "/game-setup", element: h(GameSetupPage) })
  await K.click(document.querySelector('button[aria-label="게임 만들기"]'))
  await K.flush(10)
  assert.equal(fake.sentOf("create_room").length, 1, "create_room을 안 보냄")
}

// 코드 입력 창: 코드 6자 붙여넣고 "참여하기" → room_join_failed
async function rejectOnCode() {
  const fake = K.signIn()
  await K.renderRoutes({ path: "/roomInvite", element: h(RoomInvitePage) })
  const boxes = within(screen.getByRole("group", { name: "방 코드 6자리" })).getAllByRole("textbox")
  await K.RTL.act(async () => { fireEvent.paste(boxes[0], { clipboardData: { getData: () => "ABC234" } }) })
  await K.click(screen.getByRole("button", { name: "참여하기" }))
  assert.equal(fake.sentOf("join_room_by_code").length, 1, "코드 입장을 안 보냄")
  await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
  await K.flush()
}

test("A09-F-233 방 만들기 화면 \"게임 만들기\" → 탈주 거절 글 보임", async () => {
  await rejectOnSetup()
  assert.ok(shownSomewhere(COOLDOWN_TEXT), `알림: ${JSON.stringify(K.dialogs.alerts)}`)
})

test("A09-F-234 코드 입력 창 \"참여하기\" → 탈주 거절 글 보임", async () => {
  await rejectOnCode()
  assert.ok(shownSomewhere(COOLDOWN_TEXT), `알림: ${JSON.stringify(K.dialogs.alerts)}`)
})

test("A09-F-235 공개 방 목록에서 방 골라 입장 → 탈주 거절 글 보임", async () => {
  const fake = K.signIn()
  fake.answer("get_public_rooms", { ok: true, rooms: [{ id: "room-7", title: "봄의 방", current: 3, max: 6, accessType: "open", status: "waiting", settingsVersion: 1, settings: null }] })
  await K.renderRoutes({ path: "/multiplay", element: h(MultiplayEntryPage) })
  await K.flush(10)
  const region = screen.getByRole("region", { name: "공개 방 목록" })
  const row = region.querySelector("li:not([aria-hidden='true'])")
  await K.click(within(row).getByRole("button"))
  await K.click(screen.getByRole("button", { name: "선택한 방 입장" }))
  assert.deepEqual(fake.sentOf("join_public_room"), [{ roomId: "room-7" }])
  await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
  await K.flush()
  assert.ok(shownSomewhere(COOLDOWN_TEXT), `알림: ${JSON.stringify(K.dialogs.alerts)}`)
})

// 받은 초대 한 줄
const INVITE = {
  inviteId: "inv-a09p", receiverId: "a09-me", senderId: "a09-sender", senderName: "보낸친구",
  roomId: "room-1", status: "PENDING", revision: 1, creationSeq: "5",
  expiresAt: new Date(Date.now() + 180_000).toISOString(),
}
function LobbyInviteTab() {
  const navigate = useNavigate()
  const socket = K.React.useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  useFriendSocketEvents(socket, { navigate })
  const { inviteList } = usePanelInvites({ open: false, roomId: null, isRoomVerified: false })
  return h(GameInviteTab, { ...inviteList, onBack: () => {} })
}

test("A09-F-236 로비 초대 알림 칸 \"초대 수락\" → 그 초대 줄에 탈주 거절 글", async () => {
  const fake = K.signIn({ connected: false })
  K.fetchRoutes["GET /friends/invites"] = { body: { data: { invites: [INVITE], cursor: "0" } } }
  useGameInviteStore.getState().syncAccount()
  useGameInviteStore.setState({ status: "success", snapshotLoaded: true })
  await K.renderRoutes({ path: "/lobby", element: h(LobbyInviteTab) })
  await K.RTL.act(async () => { fake.fire("game_invite_received", { invite: INVITE, sfxEvent: null }) })
  await K.flush(10)
  fake.connected = true
  fake.answer("accept_game_invite", REFUSAL)
  const row = () => document.querySelector('[data-invite-id="inv-a09p"]')
  await K.click(within(row()).getByRole("button", { name: /초대 수락/ }))
  await K.flush(20)
  assert.ok(row().textContent.includes(COOLDOWN_TEXT), `줄 글: ${row().textContent}`)
})

test("A09-F-237 모드 선택(매칭) 화면에서 찾는 중 room_join_failed → 탈주 거절 글 보임", async () => {
  const fake = K.signIn()
  await K.renderRoutes({ path: "/gameMode", element: h(GameModePage) })
  // 랜덤 매칭 카드는 지금 잠겨 있어(준비중) 찾는 중 상태를 바로 켬
  await K.RTL.act(async () => { K.useMatchingStore.getState().startSearch() })
  await K.flush()
  await K.RTL.act(async () => { fake.fire("room_join_failed", BROADCAST_REFUSAL) })
  await K.flush()
  assert.ok(shownSomewhere(COOLDOWN_TEXT), `알림: ${JSON.stringify(K.dialogs.alerts)}`)
  assert.equal(K.useMatchingStore.getState().isSearching, false)
})

test("A09-F-238 방 만들기 화면 탈주 거절 글이 role=alert 또는 status 칸 안", async () => {
  await rejectOnSetup()
  assert.ok(inLiveRegion(COOLDOWN_TEXT), `읽기 칸에 글 없음 (브라우저 알림 창: ${JSON.stringify(K.dialogs.alerts)})`)
})

test("A09-F-239 코드 입력 창 탈주 거절 글이 role=alert 또는 status 칸 안", async () => {
  await rejectOnCode()
  assert.ok(inLiveRegion(COOLDOWN_TEXT), `읽기 칸에 글 없음 (브라우저 알림 창: ${JSON.stringify(K.dialogs.alerts)})`)
})
