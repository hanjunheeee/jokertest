// 화면 상태 시험: 대기방 값 — 들어옴·나감·방장 바뀜·준비 바뀜 알림 반영(옛 알림은 버림), 방 삭제, 준비 답, 삭제 확인 창, 손님 나가기
// 목록 A01-F-588~603·741~745 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/waiting-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup } = await import("@testing-library/react")
const { MemoryRouter, useLocation } = await import("react-router-dom")
const { useMatchingPage } = await import("../../src/domains/game/matching/hooks/useMatchingPage.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, HOLD, flush } = await import("./a01b-helpers.mjs")
const { setAppConfirmHandler } = await import("../../src/shared/utils/appConfirm.js")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll(); setAppConfirmHandler(null) })

// 대기방 화면 훅 그리기 (지금 주소는 where.path로 봄), verified면 방 확인 답을 바로 줌
async function setup({ me = "host", room = roomOf({ n: 5, max: 6 }), verified = true } = {}) {
  signIn(me)
  const dialogs = installDialogs(dom)
  installFakeFetch()
  const fake = useFakeSocket()
  fake.answer("get_current_room", verified ? { ok: true, room } : HOLD)
  useMatchingStore.getState().setRoom(room)
  const where = { path: null }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/game-matching"] }, h(Where), children)
  const view = renderHook(() => useMatchingPage(), { wrapper })
  await act(async () => { await flush() })
  return { fake, view, room, dialogs, where }
}

// 같은 방 알림에 붙는 값
const SAME = { roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1" }
const players = () => useMatchingStore.getState().players
const say = async (fake, event, payload) => { await act(async () => { fake.serverSays(event, payload); await flush() }) }

test("A01-F-588 player_joined_room → 명단 맨 뒤에 그 사람, 준비 안 됨", async () => {
  const { fake } = await setup()
  await say(fake, "player_joined_room", { ...SAME, player: { uuid: "new-1", nickname: "새사람", isReady: false, membershipId: "m-new-1" } })
  const list = players()
  assert.equal(list.length, 6)
  assert.equal(list[list.length - 1].uuid, "new-1")
  assert.equal(list[list.length - 1].isReady, false)
})

test("A01-F-589 같은 자리 번호 player_left_room → 명단에서 빠짐", async () => {
  const { fake } = await setup()
  await say(fake, "player_left_room", { ...SAME, uuid: "guest-2", membershipId: "m-guest-2" })
  assert.equal(players().some((p) => p.uuid === "guest-2"), false)
  assert.equal(players().length, 4)
})

test("A01-F-590 다시 들어와 새 자리 번호인 사람에게 옛 자리 번호 player_left_room → 안 빠짐", async () => {
  const { fake } = await setup()
  await say(fake, "player_left_room", { ...SAME, uuid: "guest-2", membershipId: "m-guest-2" })
  await say(fake, "player_joined_room", { ...SAME, player: { uuid: "guest-2", nickname: "사람3", isReady: false, membershipId: "m-guest-2-new" } })
  await say(fake, "player_left_room", { ...SAME, uuid: "guest-2", membershipId: "m-guest-2" })
  assert.equal(players().some((p) => p.uuid === "guest-2"), true)
})

test("A01-F-591 host_changed { hostUuid: 나 } → 내가 방장(방장 단추 조건 참)", async () => {
  const { fake, view } = await setup({ me: "guest-1" })
  assert.equal(view.result.current.isHost, false)
  await say(fake, "host_changed", { ...SAME, hostUuid: "guest-1", settingsVersion: 1 })
  assert.equal(view.result.current.isHost, true)
  assert.equal(view.result.current.isKickHost, true)
})

test("A01-F-592 옛 방 회차의 host_changed → 방장 그대로", async () => {
  const { fake, view } = await setup({ me: "guest-1" })
  await say(fake, "host_changed", { ...SAME, roomInstanceId: "inst-old", hostUuid: "guest-1", settingsVersion: 1 })
  assert.equal(useMatchingStore.getState().hostUuid, "host")
  assert.equal(view.result.current.isHost, false)
})

test("A01-F-593 player_ready_changed { uuid, isReady: true } → 그 사람 준비", async () => {
  const { fake } = await setup()
  await say(fake, "player_ready_changed", { roomId: "room-1", uuid: "guest-3", isReady: true, settingsVersion: 1, readyRevision: 1 })
  assert.equal(players().find((p) => p.uuid === "guest-3").isReady, true)
})

test("A01-F-594 순번 3 반영 뒤 순번 2 알림이 늦게 옴 → 순번 3 값 그대로", async () => {
  const { fake } = await setup()
  await say(fake, "player_ready_changed", { roomId: "room-1", uuid: "guest-3", isReady: true, settingsVersion: 1, readyRevision: 3 })
  await say(fake, "player_ready_changed", { roomId: "room-1", uuid: "guest-3", isReady: false, settingsVersion: 1, readyRevision: 2 })
  assert.equal(players().find((p) => p.uuid === "guest-3").isReady, true)
})

test("A01-F-595 room_deleted → 방 비움, /multiplay", async () => {
  const { fake, where } = await setup({ me: "guest-1" })
  // 지운 뒤엔 서버도 방이 없다고 답함
  fake.answer("get_current_room", { ok: true, room: null })
  await say(fake, "room_deleted", { roomId: "room-1" })
  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.equal(where.path, "/multiplay")
})

test("A01-F-596 set_ready 답 { ok: true, isReady: true } → 내 준비 참", async () => {
  const { fake, view } = await setup()
  fake.answer("set_ready", { ok: true, isReady: true, roomId: "room-1", settingsVersion: 1, readyRevision: 1, canStart: false })
  await act(async () => { view.result.current.toggleReady(); await flush() })
  assert.equal(fake.sentOf("set_ready")[0].isReady, true)
  assert.equal(view.result.current.isReady, true)
})

test("A01-F-597 준비 중 설정 바뀜: 답 SETTINGS_VERSION_CONFLICT → \"방 설정이 변경되었습니다. 최신 설정을 확인해주세요.\" + 방 다시 묻기 1번", async () => {
  const { fake, view, dialogs } = await setup()
  const asksBefore = fake.sentOf("get_current_room").length
  fake.answer("set_ready", { ok: false, code: "SETTINGS_VERSION_CONFLICT" })
  await act(async () => { view.result.current.toggleReady(); await flush() })
  assert.deepEqual(dialogs.alerts, ["방 설정이 변경되었습니다. 최신 설정을 확인해주세요."])
  assert.equal(fake.sentOf("get_current_room").length - asksBefore, 1)
})

test("A01-F-598 준비 답 { ok: false } → \"준비 상태를 변경하지 못했습니다.\"", async () => {
  const { fake, view, dialogs } = await setup()
  fake.answer("set_ready", { ok: false })
  await act(async () => { view.result.current.toggleReady(); await flush() })
  assert.deepEqual(dialogs.alerts, ["준비 상태를 변경하지 못했습니다."])
})

test("A01-F-599 [지금 동작] 방 확인 전 준비 누름 → set_ready 보냄 0번", async () => {
  const { fake, view } = await setup({ verified: false })
  await act(async () => { view.result.current.toggleReady(); await flush() })
  assert.equal(fake.sentOf("set_ready").length, 0)
})

test("A01-F-600 방 삭제 확인 창 \"방을 삭제하면 모든 참가자가 나가게 됩니다.(줄바꿈)삭제하시겠습니까?\" 취소 → delete_room 0번", async () => {
  const { fake, view, dialogs } = await setup()
  dialogs.confirmAnswer = false
  await act(async () => { await view.result.current.deleteRoom() })
  assert.deepEqual(dialogs.confirms, ["방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?"])
  assert.equal(fake.sentOf("delete_room").length, 0)
})

test("A01-F-601 확인 창에서 확인 → delete_room 1번", async () => {
  const { fake, view } = await setup()
  fake.answer("delete_room", { ok: true })
  await act(async () => { await view.result.current.deleteRoom() })
  assert.equal(fake.sentOf("delete_room").length, 1)
})

test("A01-F-602 삭제 답 { ok: false } → \"방을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.\"", async () => {
  const { fake, view, dialogs } = await setup()
  fake.answer("delete_room", { ok: false })
  await act(async () => { await view.result.current.deleteRoom() })
  assert.deepEqual(dialogs.alerts, ["방을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요."])
})

test("A01-F-603 손님 \"방 나가기\" → leave_room 1번, /multiplay", async () => {
  const { fake, view, where } = await setup({ me: "guest-1" })
  fake.answer("get_current_room", { ok: true, room: null })
  await act(async () => { view.result.current.handleBack(); await flush() })
  assert.equal(fake.sentOf("leave_room").length, 1)
  assert.equal(where.path, "/multiplay")
})

// 앱 확인 창(appConfirm): 손잡이를 끼우면(모바일 양피지 창) window.confirm 대신 그쪽에 물음
test("A01-F-741 앱 확인 창 손잡이를 끼움 → 방 삭제 확인 글이 손잡이로 감(브라우저 확인 창 안 뜸), 손잡이가 취소 → delete_room 0번", async () => {
  const { fake, view, dialogs } = await setup()
  const asked = []
  setAppConfirmHandler(async (message) => { asked.push(message); return false })
  await act(async () => { await view.result.current.deleteRoom() })
  assert.deepEqual(asked, ["방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?"])
  assert.deepEqual(dialogs.confirms, [])
  assert.equal(fake.sentOf("delete_room").length, 0)
})

test("A01-F-742 앱 확인 창 손잡이가 확인(약속으로 true) → delete_room 1번", async () => {
  const { fake, view } = await setup()
  fake.answer("delete_room", { ok: true })
  setAppConfirmHandler(() => Promise.resolve(true))
  await act(async () => { await view.result.current.deleteRoom() })
  assert.equal(fake.sentOf("delete_room").length, 1)
})

// 새로고침·주소 바로 입력: 방 값 없이 대기방에 들어오면 첫 방 확인 답이 올 때까지 머묾 (바로 목록으로 가면 서버 15초 안에 방 확인을 못 물어 자리를 잃음)
async function setupRefresh({ me = "guest-2" } = {}) {
  signIn(me)
  installDialogs(dom)
  installFakeFetch()
  const fake = useFakeSocket()
  fake.answer("get_current_room", HOLD)
  const where = { path: null }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/game-matching"] }, h(Where), children)
  const view = renderHook(() => useMatchingPage(), { wrapper })
  await act(async () => { await flush() })
  return { fake, view, where }
}

test("A01-F-743 새로고침(방 값 없음) → 첫 방 확인 답 오기 전엔 대기방(/game-matching)에 머묾, 방 확인 1번 보냄", async () => {
  const { fake, view, where } = await setupRefresh()
  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.equal(fake.sentOf("get_current_room").length, 1)
  assert.equal(where.path, "/game-matching")
  assert.equal(view.result.current.canStayOnMatchingPage, true)
})

test("A01-F-744 새로고침 → 방 확인 답에 내가 앉은 방 → 대기방에 그대로, 방 명단 들어감", async () => {
  const { fake, view, where } = await setupRefresh({ me: "guest-2" })
  const room = roomOf({ n: 4, max: 6 })
  await act(async () => { fake.release("get_current_room", { ok: true, room }); await flush() })
  assert.equal(where.path, "/game-matching")
  assert.equal(useMatchingStore.getState().roomId, "room-1")
  assert.equal(view.result.current.isRoomVerified, true)
  assert.equal(view.result.current.canStayOnMatchingPage, true)
})

test("A01-F-745 새로고침 → 방 확인 답 방 없음 → 그때 방 목록(/multiplay)", async () => {
  const { fake, where } = await setupRefresh()
  assert.equal(where.path, "/game-matching", "답 오기 전에 목록으로 감 (준비 잘못)")
  await act(async () => { fake.release("get_current_room", { ok: true, room: null }); await flush() })
  assert.equal(where.path, "/multiplay")
})
