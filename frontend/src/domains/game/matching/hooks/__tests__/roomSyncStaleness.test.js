import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { act, cleanup, renderHook } = await import("@testing-library/react")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../store/matchingStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingRoom } = await import("../useMatchingRoom.js")
const { SOCKET_EVENTS } = await import("../../../setup/constants/gameSetupSocket.js")

const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }

const HOLD = Symbol("hold")

function createFakeSocket() {
  const listeners = new Map()
  const socket = {
    id: "sock-test",
    connected: true,
    emitted: [],
    holds: [],
    answer: () => HOLD,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      socket.emitted.push({ event, payload })
      return new Promise((resolve, reject) => {
        const result = socket.answer(event, payload)
        if (result === HOLD) { socket.holds.push({ event, resolve, reject }); return }
        resolve(result)
      })
    },
    release(event, value) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.resolve(value)
    },
    failHold(event, error = new Error('operation has timed out')) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.reject(error)
    },
    countOf(event) { return socket.emitted.filter((entry) => entry.event === event).length },
    lastOf(event) { return [...socket.emitted].reverse().find((entry) => entry.event === event) },
  }
  return socket
}

const ROOM_ID = "room-1"

function serverRoom({ settingsVersion = 1, hostUuid = "host-a", players, canStart = false } = {}) {
  return {
    roomId: ROOM_ID,
    roomCode: "ABCD12",
    hostUuid,
    canStart,
    accessType: "open",
    settingsVersion,
    settings: {
      maxPlayers: 8, jokerCount: 2, roleCompositionMode: "auto",
      dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    },
    players: players ?? [
      { uuid: "host-a", nickname: "host", isReady: false },
      { uuid: "p1", nickname: "p1", isReady: false },
    ],
  }
}

async function mountVerified(initialRoom = serverRoom()) {
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: "host-a" }, isLoggedIn: true })
  alerts.length = 0

  const socket = createFakeSocket()
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: initialRoom } : HOLD)
  setSocket(socket)

  const rendered = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(rendered.result.current.isRoomVerified, true, "최초 방 검증이 끝나지 않았다")
  return { socket, ...rendered }
}

test.afterEach(() => {
  cleanup()
  setSocket(null)
  useMatchingStore.getState().clearRoom()
})

test("AC-04 · 설정 변경으로 전원 준비가 해제된 뒤 도착한 옛 준비 ACK는 그 해제를 되돌리지 못한다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === "set_ready" ? HOLD : { ok: true, room: serverRoom() })
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)
  assert.deepEqual(socket.lastOf("set_ready").payload,
    { isReady: true, roomId: ROOM_ID, expectedSettingsVersion: 1 })

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID,
      settingsVersion: 2,
      accessType: "open",
      settings: { ...serverRoom().settings, maxPlayers: 6 },
      hostUuid: "host-a",
      canStart: false,
      players: [
        { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 1 },
        { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 1 },
      ],
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2)

  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 2,
      sfxEvent: { eventId: "room:room-1:ready:host-a:2", roomId: ROOM_ID, origin: "live" },
    })
    await readyPromise
  })

  const afterStaleAck = useMatchingStore.getState()
  assert.equal(afterStaleAck.players.find((p) => p.uuid === "host-a").isReady, false,
    "옛 ACK가 해제 스냅샷을 되돌렸다")
  assert.equal(afterStaleAck.canStart, false, "옛 ACK가 canStart를 되살렸다")
  assert.equal(afterStaleAck.settingsVersion, 2)
  assert.equal(result.current.isSettingReady, false)

  socket.answer = (event) => (event === "set_ready"
    ? {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 2, readyRevision: 2,
      sfxEvent: { eventId: "room:room-1:ready:host-a:2b", roomId: ROOM_ID, origin: "live" },
    }
    : { ok: true, room: serverRoom() })
  await act(async () => { await result.current.setReady(true) })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "host-a").isReady, true,
    "최신 버전의 정상 ACK까지 버려졌다")
})

test("AC-04 · 이미 반영한 것보다 낮은 revision의 준비 방송은 표시를 되돌리지 못한다", async () => {
  const { socket } = await mountVerified()

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 4,
    })
  })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "p1").isReady, true)

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: false, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 3,
    })
  })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "p1").isReady, true,
    "낮은 revision의 늦은 방송이 표시를 되돌렸다")
})

test("AC-04 · 내 준비 ACK가 반영된 뒤 도착한 옛 전체 조회는 그 준비와 canStart를 되돌리지 못한다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === "set_ready" ? HOLD : { ok: true, room: serverRoom() })
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)

  socket.answer = () => HOLD
  await act(async () => {
    socket.trigger("host_changed", { hostUuid: "p1", canStart: false, roomId: ROOM_ID, settingsVersion: 9 })
  })
  const heldQuery = socket.holds.find((hold) => hold.event === "get_current_room")
  assert.ok(heldQuery, "방장 이전이 최신 상태 재확보를 부르지 않았다(전제가 깨졌다)")

  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
      sfxEvent: { eventId: "room:room-1:ready:host-a:1", roomId: ROOM_ID, origin: "live" },
    })
    await readyPromise
  })
  const afterAck = useMatchingStore.getState()
  assert.equal(afterAck.players.find((p) => p.uuid === "host-a").isReady, true,
    "정상 ACK가 반영되지 않았다(전제가 깨졌다)")
  assert.equal(afterAck.canStart, true)

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ hostUuid: "p1", canStart: false }) })
    await Promise.resolve(); await Promise.resolve()
  })

  const after = useMatchingStore.getState()
  assert.equal(after.players.find((p) => p.uuid === "host-a").isReady, true,
    "준비 ACK보다 먼저 발행된 조회가 내 준비를 되돌렸다")
  assert.equal(after.canStart, true, "옛 조회가 canStart를 되돌렸다")
  assert.equal(after.players.find((p) => p.uuid === "host-a").readyRevision, 1,
    "옛 조회가 준비 revision을 지웠다")
})

test("AC-04 · 아직 보지 못한 더 새로운 설정의 준비 사건은 버려지지 않고 권위 있는 재조회를 부른다", async () => {
  const { socket, result } = await mountVerified()
  const v2Room = serverRoom({ settingsVersion: 2, canStart: false })
  v2Room.players = [
    { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 1 },
    { uuid: "p1", nickname: "p1", isReady: true, readyRevision: 2 },
  ]

  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: v2Room } : HOLD)
  const queriesBefore = socket.countOf("get_current_room")
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 2, readyRevision: 2,
    })
    await Promise.resolve(); await Promise.resolve()
  })

  assert.ok(socket.countOf("get_current_room") > queriesBefore,
    "더 새로운 설정의 사건을 그냥 버리기만 했다(재조회가 없다)")
  const afterResync = useMatchingStore.getState()
  assert.equal(afterResync.settingsVersion, 2, "재조회로 최신 설정을 확보하지 못했다")
  assert.equal(afterResync.players.find((p) => p.uuid === "p1").isReady, true)
  assert.equal(afterResync.canStart, false,
    "사건의 canStart를 그대로 반영했다(서버 스냅샷이 아니라)")

  const v3Room = serverRoom({ settingsVersion: 3, canStart: false })
  socket.answer = (event) => {
    if (event === "set_ready") {
      return {
        ok: true, isReady: true, canStart: true,
        roomId: ROOM_ID, settingsVersion: 3, readyRevision: 9,
      }
    }
    return { ok: true, room: v3Room }
  }
  await act(async () => { await result.current.setReady(true); await Promise.resolve() })
  assert.equal(useMatchingStore.getState().settingsVersion, 3,
    "더 새로운 설정의 자기 ACK가 재조회를 부르지 않았다")
  assert.equal(useMatchingStore.getState().canStart, false,
    "ACK의 canStart를 확인되지 않은 설정 위에 그대로 반영했다")
})

test("AC-05 · 같은 설정 버전의 방장 이전 뒤에 도착한 옛 전체 조회는 옛 방장을 되살리지 못한다", async () => {
  const { socket, result } = await mountVerified()
  const oldRoom = serverRoom({ hostUuid: "host-a" })
  const newHostRoom = serverRoom({ hostUuid: "p1" }) // 설정 버전은 그대로 1이다

  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.equal(result.current.isRoomVerified, false, "재조회 중에는 검증이 풀려야 한다")
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: newHostRoom } : HOLD)
  await act(async () => {
    socket.trigger("host_changed", { hostUuid: "p1", canStart: false, roomId: ROOM_ID, settingsVersion: 1 })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().hostUuid, "p1")
  assert.ok(socket.countOf("get_current_room") > queriesBefore,
    "무효화된 조회를 대신할 새 조회가 나가지 않았다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: oldRoom })
    await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().hostUuid, "p1", "옛 조회가 방장 이전을 되돌렸다")
  assert.equal(result.current.isRoomVerified, true, "검증이 checking에 갇혔다")
})

test("AC-05 · 재접속 조회 중 설정 변경 방송을 받아도 검증이 checking에 갇히지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const updatedRoom = serverRoom({ settingsVersion: 2 })
  updatedRoom.settings = { ...updatedRoom.settings, maxPlayers: 6 }

  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.equal(result.current.isRoomVerified, false)

  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: updatedRoom } : HOLD)
  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 2, accessType: "open",
      settings: updatedRoom.settings, hostUuid: "host-a", canStart: false,
      players: updatedRoom.players,
    })
    await Promise.resolve(); await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 2)
  assert.equal(result.current.isRoomVerified, true,
    "방송만 받고 새 조회를 걸지 않아 검증이 멈췄다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 1 }) })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2, "옛 조회가 새 설정을 덮었다")
})

function formStateFromStore() {
  const { accessType, settings } = useMatchingStore.getState()
  return {
    checks: { "private-lobby": accessType === "code" },
    ranges: {
      "max-players": settings.maxPlayers,
      "joker-count": settings.jokerCount,
      "day-discussion-time": settings.dayDiscussionTime,
      "day-vote-time": settings.dayVoteTime,
      "night-action-time": settings.nightActionTime,
    },
    roleComposition: { mode: "auto", roleCounts: null },
    specifiedRoleNightActionTimes: [],
  }
}

test("AC-05 · 저장 응답을 기다리는 동안 끊기면 그 requestId를 붙잡아 두고, 재연결 뒤 새 저장을 만들지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })

  let savePromise
  await act(async () => {
    savePromise = result.current.saveRoomSettings({
      ...formStateFromStore(),
      ranges: { ...formStateFromStore().ranges, "max-players": 6 },
    })
  })
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)
  const sentRequestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  assert.equal(typeof sentRequestId, "string")

  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true,
    "단절이 미확정 저장의 requestId를 잃어버렸다")
  assert.equal(result.current.isSavingSettings, false, "잠금이 풀리지 않았다")

  socket.answer = (event, payload) => {
    if (event === "get_current_room") return { ok: true, room: serverRoom({ settingsVersion: 2 }) }
    if (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT) {
      return {
        ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
        roomId: payload.roomId, requestId: payload.requestId,
        room: serverRoom({ settingsVersion: 2 }),
      }
    }
    return HOLD
  }
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.hasPendingSettingsResult, true,
    "재연결만으로 미확정 요청이 사라졌다")

  let verifyResult
  await act(async () => { verifyResult = await result.current.verifyRoomSettingsResult() })
  assert.equal(verifyResult.ok, true)
  assert.equal(verifyResult.status, "APPLIED")
  assert.equal(verifyResult.settingsVersion, 2)
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1,
    "결과 확인이 새 저장을 만들었다")
  assert.deepEqual(socket.lastOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT).payload,
    { roomId: ROOM_ID, requestId: sentRequestId })
  assert.equal(result.current.hasPendingSettingsResult, false)

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS,
      { ok: true, changed: true, roomId: ROOM_ID, requestId: sentRequestId, settingsVersion: 2 })
    await savePromise
  })
  assert.equal(result.current.hasPendingSettingsResult, false)
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)
})

test("AC-05 · 방을 떠나면 그 방에 묶인 미확정 저장 요청은 더 이상 붙잡아 두지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true)

  await act(async () => { useMatchingStore.getState().clearRoom() })
  assert.equal(result.current.hasPendingSettingsResult, false,
    "떠난 방의 저장 요청을 계속 붙잡고 있다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, { ok: false, code: "NOT_IN_ROOM" })
    await savePromise
  })
})

function otherRoom(roomId = "room-2") {
  return { ...serverRoom(), roomId, roomCode: "ZZZZ99" }
}

test("AC-05 · R1→R2→R1로 돌아와도 R1에서 보낸 저장의 늦은 timeout은 새 소속을 건드리지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)

  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom()) })
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)

  await act(async () => {
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    await savePromise
  })
  assert.equal(result.current.hasPendingSettingsResult, false,
    "지난 소속의 timeout이 지금 방을 미확인 상태로 잠갔다")
  assert.equal(result.current.settingsError, null,
    "지난 소속의 timeout이 지금 방에 오류를 남겼다")

  socket.answer = () => ({ ok: true, changed: true, roomId: ROOM_ID, settingsVersion: 2 })
  let saved
  await act(async () => { saved = await result.current.saveRoomSettings(formStateFromStore()) })
  assert.equal(saved.ok, true)
})

test("AC-05 · R1→방 없음→R1 뒤에 도착한 옛 실패 ACK는 새 소속의 표시와 잠금을 건드리지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let oldSave
  await act(async () => { oldSave = result.current.saveRoomSettings(formStateFromStore()) })

  await act(async () => { useMatchingStore.getState().clearRoom() })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom({ settingsVersion: 5 })) })

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom({ settingsVersion: 5 }) })
  let newSave
  await act(async () => { newSave = result.current.saveRoomSettings(formStateFromStore()) })
  assert.equal(result.current.isSavingSettings, true)

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false,
      code: "SETTINGS_VERSION_CONFLICT",
      message: "설정이 이미 변경되었습니다.",
      room: serverRoom({ settingsVersion: 1 }),
    })
    await oldSave
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 5,
    "옛 실패 ACK의 방 스냅샷이 새 소속의 설정을 덮었다")
  assert.equal(result.current.settingsError, null, "옛 실패 ACK가 새 소속에 오류를 남겼다")
  assert.equal(result.current.isSavingSettings, true,
    "옛 요청의 finally가 새 요청의 잠금을 대신 풀었다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS,
      { ok: true, changed: true, roomId: ROOM_ID, settingsVersion: 6 })
    await newSave
  })
  assert.equal(result.current.isSavingSettings, false, "정상 완료가 잠금을 풀지 못했다")
})

test("AC-05 · 결과 조회 응답보다 먼저 도착한 설정 변경 방송이 있으면 결과는 받되 옛 방 스냅샷은 적용하지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => { socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS); await savePromise })
  assert.equal(result.current.hasPendingSettingsResult, true)

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })
  assert.deepEqual(socket.lastOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT).payload,
    { roomId: ROOM_ID, requestId })

  const v2Settings = { ...serverRoom().settings, maxPlayers: 6 }
  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 2, accessType: "open", settings: v2Settings,
      hostUuid: "host-a", canStart: false, players: serverRoom().players,
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2)

  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
      roomId: ROOM_ID, requestId, room: serverRoom({ settingsVersion: 1 }),
    })
    await verifyPromise
  })

  const after = useMatchingStore.getState()
  assert.equal(after.settingsVersion, 2, "결과 조회의 옛 방 스냅샷이 새 설정을 덮었다")
  assert.equal(after.settings.maxPlayers, 6, "결과 조회의 옛 방 스냅샷이 새 설정을 덮었다")
  assert.equal(result.current.hasPendingSettingsResult, false,
    "요청의 정착까지 함께 버려 미확인 상태에 갇혔다")
})

test("AC-05 · 결과 조회 중 방이 바뀌면 그 응답은 새 소속의 방 상태를 갱신하지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => { socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS); await savePromise })

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })

  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom({ settingsVersion: 7 })) })

  let verifyResult
  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
      roomId: ROOM_ID, requestId, room: serverRoom({ settingsVersion: 2 }),
    })
    verifyResult = await verifyPromise
  })

  assert.equal(verifyResult.code ?? "STALE", "STALE", "지난 소속의 결과 조회가 그대로 채택됐다")
  assert.equal(useMatchingStore.getState().settingsVersion, 7,
    "지난 소속의 결과 조회가 새 소속의 방 상태를 갱신했다")
})

test("AC-05 · R1→R2→R1로 돌아온 뒤 도착한 옛 전체 방 조회는 새 소속의 상태를 덮지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.equal(result.current.isRoomVerified, false, "재조회 중에는 검증이 풀려야 한다")
  const heldQuery = socket.holds.find((hold) => hold.event === "get_current_room")
  assert.ok(heldQuery, "조회를 붙잡아 두지 못했다(전제가 깨졌다)")

  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom({ settingsVersion: 7 })) })
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)
  assert.equal(useMatchingStore.getState().settingsVersion, 7)

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 1 }) })
    await Promise.resolve(); await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 7,
    "지난 소속의 전체 조회가 새 소속의 방 상태를 덮었다")
})

test("AC-05 · R1→방 없음→R1 뒤에 도착한 옛 전체 방 조회는 '방 없음'으로 화면을 정리하지 않는다", async () => {
  let roomDeletedCalls = 0
  const callbacks = { onRoomDeleted: () => { roomDeletedCalls += 1 }, onGameStarted: () => {} }
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: "host-a" }, isLoggedIn: true })
  alerts.length = 0

  const socket = createFakeSocket()
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: serverRoom() } : HOLD)
  setSocket(socket)
  const { result } = renderHook(() => useMatchingRoom(callbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true)

  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.ok(socket.holds.some((hold) => hold.event === "get_current_room"))

  await act(async () => { useMatchingStore.getState().clearRoom() })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom({ settingsVersion: 4 })) })

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: null })
    await Promise.resolve(); await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().roomId, ROOM_ID,
    "지난 소속의 '방 없음' 응답이 새 소속을 지웠다")
  assert.equal(useMatchingStore.getState().settingsVersion, 4)
  assert.equal(roomDeletedCalls, 0, "지난 소속의 응답이 방 삭제 콜백을 불렀다")
})

test("AC-04 · 같은 방으로 다시 들어온 뒤 도착한 옛 준비 ACK는 새 소속의 표시를 바꾸지 못한다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === "set_ready" ? HOLD : { ok: true, room: serverRoom() })
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)

  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom()) })
  assert.equal(
    useMatchingStore.getState().players.find((p) => p.uuid === "host-a").isReady, false,
    "새 소속의 서버 스냅샷은 미준비다(전제)",
  )

  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 5,
      sfxEvent: { eventId: "room:room-1:ready:host-a:5", roomId: ROOM_ID, origin: "live" },
    })
    await readyPromise
  })

  const after = useMatchingStore.getState()
  assert.equal(after.players.find((p) => p.uuid === "host-a").isReady, false,
    "지난 소속의 준비 ACK가 새 소속의 준비 표시를 바꿨다")
  assert.equal(after.canStart, false, "지난 소속의 ACK가 canStart를 바꿨다")

  socket.answer = (event) => (event === "set_ready"
    ? {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 6,
      sfxEvent: { eventId: "room:room-1:ready:host-a:6", roomId: ROOM_ID, origin: "live" },
    }
    : { ok: true, room: serverRoom() })
  await act(async () => { await result.current.setReady(true) })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "host-a").isReady, true,
    "지금 소속의 정상 ACK까지 버려졌다")
})

test("AC-04 · 소속이 갈리면 진행 중이던 시작 잠금이 풀리고, 그 옛 응답이 새 시작의 잠금을 대신 풀지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === "start_game" ? HOLD : { ok: true, room: serverRoom() })
  let oldStart
  await act(async () => { oldStart = result.current.startGame() })
  assert.equal(socket.countOf("start_game"), 1)
  assert.equal(result.current.isStarting, true)

  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom()) })
  assert.equal(result.current.isStarting, false,
    "지난 소속의 시작 요청이 새 소속의 시작을 계속 막고 있다")

  let newStart
  await act(async () => { newStart = result.current.startGame() })
  assert.equal(socket.countOf("start_game"), 2, "새 소속에서 시작 요청을 보내지 못했다")
  assert.equal(result.current.isStarting, true)

  await act(async () => {
    socket.release("start_game", { ok: false, message: "지난 소속의 실패" })
    await oldStart
  })
  assert.notEqual(result.current.startBlockedMessage, "지난 소속의 실패", "지난 소속의 실패가 지금 화면에 안내됐다")
  assert.equal(result.current.isStarting, true, "옛 요청의 finally가 새 요청의 잠금을 대신 풀었다")

  await act(async () => {
    socket.release("start_game", { ok: false, message: "지금 소속의 실패" })
    await newStart
  })
  assert.equal(result.current.startBlockedMessage, "지금 소속의 실패")
  assert.equal(result.current.isStarting, false, "정상 완료가 잠금을 풀지 못했다")
})

test("AC-05 · 계정이 바뀌면 이전 계정의 미확정 저장 요청은 남지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true)

  await act(async () => { useAuthStore.setState({ user: { uuid: "other-account" }, isLoggedIn: true }) })
  assert.equal(result.current.hasPendingSettingsResult, false,
    "다른 계정이 이전 계정의 저장 결과를 물을 수 있는 상태가 남았다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, { ok: false, code: "STALE_SOCKET" })
    await savePromise
  })
})

test("AC-05 · 다른 방으로 소속이 갈리면 이전 방의 검증을 물려받지 않고 그 소속을 서버에 다시 확인한다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  await act(async () => { useMatchingStore.getState().setRoom(otherRoom()) })

  assert.equal(result.current.isRoomVerified, false,
    "이전 방에서 받은 검증이 새 소속에 그대로 남았다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "새 소속을 확인하는 조회가 나가지 않았다")

  const readyBefore = socket.countOf("set_ready")
  const startBefore = socket.countOf("start_game")
  await act(async () => { await result.current.setReady(true) })
  await act(async () => { await result.current.startGame() })
  assert.equal(socket.countOf("set_ready"), readyBefore, "미검증 소속에서 준비 요청이 나갔다")
  assert.equal(socket.countOf("start_game"), startBefore, "미검증 소속에서 시작 요청이 나갔다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: otherRoom() })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(result.current.isRoomVerified, true, "새 소속의 조회가 검증으로 이어지지 않았다")
  assert.equal(useMatchingStore.getState().roomId, "room-2")
})

test("AC-05 · 확인 중에 R1→방 없음→R1을 지나면 옛 조회는 버려지고 각 소속이 자기 조회를 받는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.equal(result.current.isRoomVerified, false)
  const afterConnect = socket.countOf("get_current_room")

  await act(async () => { useMatchingStore.getState().clearRoom() })
  await act(async () => { useMatchingStore.getState().setRoom(serverRoom({ settingsVersion: 4 })) })
  assert.equal(socket.countOf("get_current_room"), afterConnect + 2,
    "소속이 두 번 갈렸는데 그 소속들의 조회가 나가지 않았다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 1 }) })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 4, "지난 소속의 조회가 새 소속을 덮었다")
  assert.equal(result.current.isRoomVerified, false,
    "지난 소속의 응답으로 지금 소속이 검증됐다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: null })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID, "지난 소속의 '방 없음'이 적용됐다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 4 }) })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(result.current.isRoomVerified, true, "지금 소속의 검증이 끝나지 않고 멈췄다")
})

test("AC-05 · 서버가 확정해 준 방 교체는 같은 사실을 다시 묻지 않는다", async () => {
  let roomDeletedCalls = 0
  const callbacks = { onRoomDeleted: () => { roomDeletedCalls += 1 }, onGameStarted: () => {} }
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: "host-a" }, isLoggedIn: true })

  const socket = createFakeSocket()
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: serverRoom() } : HOLD)
  setSocket(socket)
  const { result } = renderHook(() => useMatchingRoom(callbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

  assert.equal(result.current.isRoomVerified, true)
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)
  assert.equal(socket.countOf("get_current_room"), 1,
    "최초 방 발견이 스스로 재확인을 불러 조회가 반복됐다")

  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(socket.countOf("get_current_room"), 2, "같은 방 재확인이 조회를 중복으로 만들었다")
  assert.equal(result.current.isRoomVerified, true)

  await act(async () => { socket.trigger("room_deleted", {}) })
  assert.equal(useMatchingStore.getState().roomId, null)
  assert.equal(roomDeletedCalls, 1)
  assert.equal(socket.countOf("get_current_room"), 2,
    "방이 사라진 뒤 여분의 조회가 나갔다")
})

test("AC-03 · 이미 아는 것보다 낮은 버전의 설정 스냅샷은 설정도 명단도 되돌리지 못한다", async () => {
  const { socket } = await mountVerified()

  const v9Room = serverRoom({ settingsVersion: 9, hostUuid: "p1", canStart: true })
  v9Room.settings = { ...v9Room.settings, maxPlayers: 10 }
  v9Room.players = [
    { uuid: "host-a", nickname: "host", isReady: true, readyRevision: 3 },
    { uuid: "p1", nickname: "p1", isReady: true, readyRevision: 4 },
  ]
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: v9Room } : HOLD)
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(useMatchingStore.getState().settingsVersion, 9, "전제가 깨졌다(v9를 확보하지 못했다)")

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 7, accessType: "code",
      settings: { ...serverRoom().settings, maxPlayers: 4 },
      hostUuid: "host-a", canStart: false,
      players: [
        { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 1 },
        { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 1 },
      ],
    })
  })

  const after = useMatchingStore.getState()
  assert.equal(after.settingsVersion, 9, "낮은 버전의 스냅샷이 설정 버전을 되돌렸다")
  assert.equal(after.settings.maxPlayers, 10, "낮은 버전의 스냅샷이 설정을 되돌렸다")
  assert.equal(after.accessType, "open", "낮은 버전의 스냅샷이 입장 방식을 되돌렸다")
  assert.equal(after.hostUuid, "p1", "낮은 버전의 스냅샷이 방장을 되돌렸다")
  assert.equal(after.canStart, true, "낮은 버전의 스냅샷이 canStart를 되돌렸다")
  assert.equal(after.players.find((p) => p.uuid === "p1").isReady, true,
    "낮은 버전의 스냅샷이 준비 표시를 되돌렸다")

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 10, accessType: "code",
      settings: { ...serverRoom().settings, maxPlayers: 6 },
      hostUuid: "p1", canStart: false,
      players: [
        { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 4 },
        { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 5 },
      ],
    })
  })
  const applied = useMatchingStore.getState()
  assert.equal(applied.settingsVersion, 10, "정상적인 새 버전 스냅샷까지 버려졌다")
  assert.equal(applied.settings.maxPlayers, 6)
  assert.equal(applied.accessType, "code")
  assert.equal(applied.players.every((p) => p.isReady !== true), true,
    "새 설정의 전원 준비 해제가 반영되지 않았다")
})

test("AC-04 · 같은 버전의 설정 스냅샷이 다시 도착해도 그 뒤에 받은 준비 상태를 되돌리지 않는다", async () => {
  const { socket } = await mountVerified()

  const v2Snapshot = {
    roomId: ROOM_ID, settingsVersion: 2, accessType: "open",
    settings: { ...serverRoom().settings, maxPlayers: 6 },
    hostUuid: "host-a", canStart: false,
    players: [
      { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 1 },
      { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 1 },
    ],
  }

  await act(async () => { socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, v2Snapshot) })
  assert.equal(useMatchingStore.getState().settingsVersion, 2)
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6)

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 2, readyRevision: 5,
    })
  })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "p1").isReady, true,
    "전제가 깨졌다(준비가 반영되지 않았다)")

  await act(async () => { socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, { ...v2Snapshot }) })

  const after = useMatchingStore.getState()
  assert.equal(after.players.find((p) => p.uuid === "p1").isReady, true,
    "같은 버전의 중복 스냅샷이 그 뒤에 받은 준비를 되돌렸다")
  assert.equal(after.players.find((p) => p.uuid === "p1").readyRevision, 5,
    "같은 버전의 중복 스냅샷이 준비 revision을 되돌렸다")
  assert.equal(after.canStart, true, "같은 버전의 중복 스냅샷이 canStart를 되돌렸다")
  assert.equal(after.settingsVersion, 2)
  assert.equal(after.settings.maxPlayers, 6, "같은 버전인데 설정이 달라졌다")
})

test("AC-05 · 권위 있는 같은 방 조회로 더 새로운 설정을 확보한 뒤 도착한 옛 저장 실패 스냅샷은 그것을 덮지 못한다", async () => {
  const { socket, result } = await mountVerified()
  const queriesAfterMount = socket.countOf("get_current_room")

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)

  socket.answer = (event) => (event === "get_current_room"
    ? { ok: true, room: serverRoom({ settingsVersion: 3 }) }
    : HOLD)
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(useMatchingStore.getState().settingsVersion, 3, "재조회가 최신 설정을 적용하지 않았다")
  assert.equal(result.current.isRoomVerified, true)
  assert.equal(socket.countOf("get_current_room"), queriesAfterMount + 1,
    "성공한 조회가 또 다른 조회를 불렀다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false,
      code: "SETTINGS_VERSION_CONFLICT",
      message: "설정이 이미 변경되었습니다.",
      room: serverRoom({ settingsVersion: 1 }),
    })
    await savePromise
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 3,
    "옛 저장 실패 스냅샷이 권위 있는 조회로 확보한 최신 설정을 덮었다")
  assert.equal(result.current.settingsError?.code, "SETTINGS_VERSION_CONFLICT",
    "스냅샷을 버리면서 요청의 정착까지 함께 버렸다")
  assert.equal(result.current.isSavingSettings, false, "잠금이 풀리지 않았다")
})

test("AC-05 · 같은 설정 버전이어도 조회가 확보한 더 새로운 방장·준비를 옛 저장 실패 스냅샷이 되돌리지 못한다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })

  const newerSameVersion = serverRoom({
    settingsVersion: 1,
    hostUuid: "p1",
    canStart: true,
    players: [
      { uuid: "host-a", nickname: "host", isReady: true, readyRevision: 2 },
      { uuid: "p1", nickname: "p1", isReady: true, readyRevision: 3 },
    ],
  })
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: newerSameVersion } : HOLD)
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(useMatchingStore.getState().hostUuid, "p1", "재조회가 새 방장을 적용하지 않았다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false,
      code: "MAX_PLAYERS_BELOW_OCCUPANCY",
      message: "현재 인원보다 작은 정원으로는 저장할 수 없습니다.",
      room: serverRoom({ settingsVersion: 1 }),
    })
    await savePromise
  })

  const after = useMatchingStore.getState()
  assert.equal(after.hostUuid, "p1", "옛 실패 스냅샷이 방장 이전을 되돌렸다")
  assert.equal(after.players.find((p) => p.uuid === "p1").isReady, true,
    "옛 실패 스냅샷이 그 뒤에 확보한 준비 상태를 되돌렸다")
  assert.equal(after.canStart, true, "옛 실패 스냅샷이 canStart를 되돌렸다")
  assert.equal(result.current.settingsError?.code, "MAX_PLAYERS_BELOW_OCCUPANCY")
})

test("AC-05 · 조회 뒤에 시작한 저장의 실패 스냅샷과 결과 조회 스냅샷은 그대로 적용된다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === "get_current_room"
    ? { ok: true, room: serverRoom({ settingsVersion: 3 }) }
    : HOLD)
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  assert.equal(useMatchingStore.getState().settingsVersion, 3)

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS ? HOLD : HOLD)
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false,
      code: "MAX_PLAYERS_BELOW_OCCUPANCY",
      message: "현재 인원보다 작은 정원으로는 저장할 수 없습니다.",
      room: { ...serverRoom({ settingsVersion: 4 }), settings: { ...serverRoom().settings, maxPlayers: 6 } },
    })
    await savePromise
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 4,
    "신선한 실패 스냅샷까지 함께 버려졌다")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6)

  socket.answer = () => HOLD
  let timedOutSave
  await act(async () => { timedOutSave = result.current.saveRoomSettings(formStateFromStore()) })
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => { socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS); await timedOutSave })
  assert.equal(result.current.hasPendingSettingsResult, true)

  socket.answer = (event, payload) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT
    ? {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 5,
      roomId: payload.roomId, requestId: payload.requestId,
      room: serverRoom({ settingsVersion: 5 }),
    }
    : HOLD)
  await act(async () => { await result.current.verifyRoomSettingsResult() })
  assert.equal(useMatchingStore.getState().settingsVersion, 5,
    "신선한 결과 조회 스냅샷까지 함께 버려졌다")
  assert.equal(result.current.hasPendingSettingsResult, false)
})

test("AC-05 · 결과가 APPLIED로 확정된 저장은 그 뒤 다시 끊겨도 미확정으로 되살아나지 않는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS
    ? HOLD
    : { ok: true, room: serverRoom() })
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId

  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true)

  socket.answer = (event, payload) => {
    if (event === "get_current_room") return { ok: true, room: serverRoom({ settingsVersion: 2 }) }
    if (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT) {
      return {
        ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
        roomId: payload.roomId, requestId: payload.requestId,
      }
    }
    return HOLD
  }
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { await result.current.verifyRoomSettingsResult() })
  assert.equal(result.current.hasPendingSettingsResult, false, "확정된 결과가 미확정을 풀지 못했다")
  assert.equal(result.current.settingsError, null)
  assert.equal(socket.holds.some((hold) => hold.event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), true,
    "전제가 깨졌다(원래 저장 응답이 이미 정착했다)")

  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, false,
    "확정이 끝난 저장이 다음 단절에서 미확정으로 되살아났다")
  assert.equal(result.current.settingsError, null,
    "확정이 끝난 저장이 다음 단절에서 오류 표시를 되살렸다")
  assert.equal(result.current.isSavingSettings, false)

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS,
      { ok: true, changed: true, roomId: ROOM_ID, requestId, settingsVersion: 2 })
    await savePromise
  })
  assert.equal(result.current.hasPendingSettingsResult, false)
  assert.equal(result.current.settingsError, null)
})

test("AC-05 · 확정 뒤에 시작한 새 저장은 자기 요청으로 미확정에 오르고, 끝내 확인하지 못한 요청은 반복 단절에도 남는다", async () => {
  const { socket, result } = await mountVerified()

  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS ? HOLD : HOLD)
  let firstSave
  await act(async () => { firstSave = result.current.saveRoomSettings(formStateFromStore()) })
  const firstRequestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => { socket.trigger("disconnect") })
  socket.answer = (event, payload) => {
    if (event === "get_current_room") return { ok: true, room: serverRoom({ settingsVersion: 2 }) }
    if (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT) {
      return { ok: true, status: "APPLIED", changed: true, settingsVersion: 2, roomId: payload.roomId, requestId: payload.requestId }
    }
    return HOLD
  }
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  await act(async () => { await result.current.verifyRoomSettingsResult() })
  assert.equal(result.current.hasPendingSettingsResult, false)

  socket.answer = () => HOLD
  let secondSave
  await act(async () => { secondSave = result.current.saveRoomSettings(formStateFromStore()) })
  const secondRequestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  assert.notEqual(secondRequestId, firstRequestId)

  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true,
    "새 저장이 단절에서 미확정으로 승격되지 않았다")

  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: serverRoom({ settingsVersion: 2 }) } : HOLD)
  await act(async () => { socket.trigger("connect"); await Promise.resolve(); await Promise.resolve() })
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })
  assert.deepEqual(socket.lastOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT).payload,
    { roomId: ROOM_ID, requestId: secondRequestId },
    "승격된 식별자가 새 저장의 것이 아니다")
  await act(async () => {
    socket.failHold(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT)
    await verifyPromise
  })
  assert.equal(result.current.hasPendingSettingsResult, true)

  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true,
    "끝내 확인하지 못한 요청이 반복 단절에서 사라졌다")
  assert.equal(result.current.settingsError?.code, "UNKNOWN")

  await act(async () => {
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    await firstSave
    await secondSave
  })
})
