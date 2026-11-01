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
  "../../../../helpers/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { act, cleanup, renderHook } = await import("@testing-library/react")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useMatchingRoom } = await import("../../../../../src/domains/game/matching/hooks/useMatchingRoom.js")
const { SOCKET_EVENTS } = await import("../../../../../src/domains/game/shared/constants/gameSetupSocket.js")

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
    failHold(event, error = new Error("operation has timed out")) {
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

function serverRoom({ settingsVersion = 1, hostUuid = "host-a", players, canStart = false, settings } = {}) {
  return {
    roomId: ROOM_ID,
    roomCode: "ABCD12",
    hostUuid,
    canStart,
    accessType: "open",
    settingsVersion,
    settings: settings ?? {
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

function formStateFromStore() {
  const { settings, accessType } = useMatchingStore.getState()
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

async function createPendingSave(socket, result) {
  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS ? HOLD : HOLD)
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => {
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    await savePromise
  })
  assert.equal(result.current.hasPendingSettingsResult, true, "미확정 저장이 만들어지지 않았다")
  return requestId
}

function playerOf(uuid) {
  return useMatchingStore.getState().players.find((p) => p.uuid === uuid)
}

test.afterEach(() => {
  cleanup()
  setSocket(null)
  useMatchingStore.getState().clearRoom()
})

test("AC-04 · 내 준비 revision이 현재여도, 그 뒤에 도착한 더 새로운 방 전체 canStart를 옛 ACK가 덮지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = (event) => (event === "set_ready" ? HOLD : HOLD)
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })
  assert.equal(useMatchingStore.getState().canStart, true, "전제가 깨졌다(P의 준비가 반영되지 않았다)")

  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
    await readyPromise
    await Promise.resolve()
  })

  assert.equal(playerOf("host-a").isReady, true, "내 준비 결과가 사라졌다")
  assert.equal(playerOf("host-a").readyRevision, 1, "내 준비 revision이 반영되지 않았다")
  assert.equal(playerOf("p1").isReady, true, "다른 참가자의 준비가 되돌아갔다")
  assert.equal(useMatchingStore.getState().canStart, true,
    "옛 ACK의 방 전체 canStart가 더 새로운 값을 덮었다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "권위 있는 수렴 조회가 정확히 한 번 나가지 않았다")

  await act(async () => {
    socket.release("get_current_room", {
      ok: true,
      room: serverRoom({
        canStart: true,
        players: [
          { uuid: "host-a", nickname: "host", isReady: true, readyRevision: 1 },
          { uuid: "p1", nickname: "p1", isReady: true, readyRevision: 1 },
        ],
      }),
    })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().canStart, true)
  assert.equal(result.current.isRoomVerified, true, "수렴 조회 뒤에도 검증이 돌아오지 않았다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "수렴 조회가 꼬리를 물고 반복됐다")
})

test("AC-04 · 더 새로운 준비 해제로 canStart=false가 된 뒤, 옛 ACK의 canStart=true가 시작 권한을 되살리지 못한다", async () => {
  const { socket, result } = await mountVerified(serverRoom({ canStart: false }))

  socket.answer = () => HOLD
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: false, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 2,
    })
  })
  assert.equal(useMatchingStore.getState().canStart, false)

  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
    await readyPromise
    await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().canStart, false,
    "옛 ACK가 이미 사라진 시작 권한을 되살렸다")
  assert.equal(playerOf("host-a").isReady, true, "내 준비 결과가 사라졌다")
  assert.equal(playerOf("p1").isReady, false, "더 새로운 준비 해제가 되돌아갔다")
})

test("AC-04 · 중간 사건이 없으면 내 준비 ACK의 방 전체 canStart와 revision이 그대로 적용되고 추가 조회도 없다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 3,
    })
    await readyPromise
    await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().canStart, true, "유효한 현재 ACK의 canStart가 버려졌다")
  assert.equal(playerOf("host-a").isReady, true)
  assert.equal(playerOf("host-a").readyRevision, 3)
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "유효한 현재 ACK가 불필요한 조회를 만들었다")
})

test("AC-05 · 결과 조회 중 끼어든 옛 준비 방송 때문에 응답이 드러낸 더 새로운 설정을 놓치지 않는다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")
  const savesBefore = socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })
  assert.equal(socket.countOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT), 1)

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 1)

  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
      roomId: ROOM_ID,
      room: serverRoom({ settingsVersion: 2, settings: {
        maxPlayers: 6, jokerCount: 2, roleCompositionMode: "auto",
        dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
      } }),
    })
    await verifyPromise
    await Promise.resolve()
  })

  const settled = await verifyPromise
  assert.equal(settled.ok, true)
  assert.equal(settled.status, "APPLIED")
  assert.equal(result.current.hasPendingSettingsResult, false, "원 요청이 정착하지 않았다")
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), savesBefore,
    "결과 확인이 자동 재저장을 만들었다")

  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "더 새로운 설정 버전이 드러났는데 재확보 조회가 나가지 않았다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 2 }) })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2,
    "화면이 v1에 머문 채 그 버전을 기대 버전으로 삼고 있다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1, "조회가 꼬리를 물었다")
})

test("AC-05 · 저장 실패 응답도 끼어든 준비 사건 때문에 더 새로운 서버 설정을 버리지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formStateFromStore()) })
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false, code: "SETTINGS_VERSION_CONFLICT", message: "방 설정이 변경되었습니다.",
      room: serverRoom({ settingsVersion: 2 }),
    })
    await savePromise
    await Promise.resolve()
  })

  assert.equal(result.current.settingsError?.code, "SETTINGS_VERSION_CONFLICT")
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "거부 응답이 드러낸 더 새로운 설정을 확보하지 않았다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 2 }) })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2,
    "거부 뒤에도 화면이 낡은 기대 버전에 머물렀다")
})

test("AC-05 · 보존 · 이미 더 새로운 설정 방송을 반영했다면 옛 스냅샷을 실은 결과는 그것을 되돌리지도, 조회를 만들지도 않는다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 2, accessType: "open",
      settings: { ...serverRoom().settings, maxPlayers: 6 },
      hostUuid: "host-a", canStart: false,
      players: [
        { uuid: "host-a", nickname: "host", isReady: false, readyRevision: 1 },
        { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 1 },
      ],
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2)

  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 1,
      roomId: ROOM_ID, room: serverRoom({ settingsVersion: 1 }),
    })
    await verifyPromise
    await Promise.resolve()
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 2, "옛 스냅샷이 더 새로운 설정을 되돌렸다")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6, "옛 스냅샷이 설정 값을 되돌렸다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "이미 최신인데도 여분의 조회가 나갔다")
  assert.equal(result.current.hasPendingSettingsResult, false)
})

test("AC-05 · 보존 · 방 스냅샷이 없는 결과는 끼어든 준비 사건과 무관하게 현재 소속을 다시 확인한다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })

  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2, roomId: ROOM_ID, room: null,
    })
    await verifyPromise
    await Promise.resolve()
  })

  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "스냅샷 없는 결과가 소속 재확인을 만들지 않았다")
  assert.equal(result.current.isRoomVerified, false, "확인이 끝나기 전에 검증이 남아 있다")
})

test("AC-05 · 보존 · 중간 사건이 없으면 결과에 실린 신선한 스냅샷을 그대로 적용하고 여분의 조회를 만들지 않는다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = (event) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT
    ? {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2, roomId: ROOM_ID,
      room: serverRoom({ settingsVersion: 2 }),
    }
    : HOLD)

  let verified
  await act(async () => { verified = await result.current.verifyRoomSettingsResult() })

  assert.equal(verified.status, "APPLIED")
  assert.equal(useMatchingStore.getState().settingsVersion, 2, "신선한 스냅샷이 적용되지 않았다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "이미 최신 스냅샷을 적용했는데 조회가 또 나갔다")
  assert.equal(result.current.hasPendingSettingsResult, false)
})


for (const transition of ["join", "leave"]) {
 test("operator: membership event keeps latest canStart after held ready ACK " + transition, async () => {
  const players = [
   {uuid:"host-a",nickname:"host",isReady:false,readyRevision:0},
   ...["p1","p2","p3"].map(uuid=>({uuid,nickname:uuid,isReady:true,readyRevision:1})),
   ...(transition==="leave" ? [{uuid:"p4",nickname:"p4",isReady:false,readyRevision:0}] : []),
  ]
  const { socket, result } = await mountVerified(serverRoom({players,canStart:false}))
  socket.answer=()=>HOLD
  const queriesBefore=socket.countOf("get_current_room")
  let readyPromise
  await act(async()=>{readyPromise=result.current.setReady(true)})
  const latestCanStart=transition==="leave"
  await act(async()=>{
    if(transition==="join")socket.trigger("player_joined_room",{
      player:{uuid:"p4",nickname:"p4",isReady:false,readyRevision:0},canStart:false})
    else socket.trigger("player_left_room",{uuid:"p4",canStart:true})
  })
  assert.equal(useMatchingStore.getState().canStart,latestCanStart)
  await act(async()=>{
    socket.release("set_ready",{ok:true,isReady:true,canStart:!latestCanStart,
      roomId:ROOM_ID,settingsVersion:1,readyRevision:1})
    await readyPromise
  })
  assert.equal(playerOf("host-a").isReady,true)
  assert.equal(useMatchingStore.getState().canStart,latestCanStart,
    "old own ACK overwrote the membership event's room-wide start permission")
  assert.equal(socket.countOf("get_current_room"),queriesBefore+1)
  const current=useMatchingStore.getState()
  await act(async()=>{socket.release("get_current_room",{ok:true,room:serverRoom({
    players:current.players,canStart:latestCanStart})})})
  assert.equal(result.current.isRoomVerified,true)
  assert.equal(socket.countOf("get_current_room"),queriesBefore+1)
 })
}
