/**
 * F-20 AC-04/AC-05: 늦은 응답·사건 순서·단절을 넘는 미확정 저장의 회귀.
 *
 * 실제 useMatchingRoom과 실제 matchingStore를 그대로 쓴다. 소켓만 대역인데, 모듈을 목업하지
 * 않고 **실제 socketClient.setSocket**으로 대역 인스턴스를 꽂는다 — 그래서 이 파일은
 * `--experimental-test-module-mocks` 없이 그대로 돈다.
 *
 * 각 시험은 "무엇을 붙잡아 두고, 그 사이에 무엇을 도착시키고, 그 다음 무엇을 놓아주는가"를
 * 명시적으로 제어한다. 그 순서가 곧 재현하려는 사건이다.
 */
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
// 실제 화면 코드가 쓰는 확인 대화상자/경고는 기록만 한다(사용자 입력을 기다리면 멈춘다).
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

/** useMatchingPage처럼 메모된 콜백을 쓴다 — 렌더마다 방 동기화를 다시 시작하지 않게 한다. */
const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }

/** emitWithAck 응답을 붙잡아 두라는 표식. */
const HOLD = Symbol("hold")

function createFakeSocket() {
  const listeners = new Map()
  const socket = {
    id: "sock-test",
    connected: true,
    emitted: [],
    holds: [],
    /** (event, payload) => 응답값 | HOLD. 시험이 매 순간 갈아끼운다. */
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
    /** 붙잡아 둔 응답 하나를 놓아준다. */
    release(event, value) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.resolve(value)
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

/** 소켓·store·계정을 세우고 최초 get_current_room까지 끝내 'verified'로 만든다. */
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

// ── AC-04: 늦은 준비 ACK ────────────────────────────────────────────────────

test("AC-04 · 설정 변경으로 전원 준비가 해제된 뒤 도착한 옛 준비 ACK는 그 해제를 되돌리지 못한다", async () => {
  const { socket, result } = await mountVerified()

  // 준비 요청의 ACK를 붙잡아 둔다 — 이 구간이 곧 저장과 겹치는 창이다.
  socket.answer = (event) => (event === "set_ready" ? HOLD : { ok: true, room: serverRoom() })
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)
  // 실제 클라이언트가 방·설정 버전을 함께 실었는지(F-20 AC-04 필수 계약) 확인한다.
  assert.deepEqual(socket.lastOf("set_ready").payload,
    { isReady: true, roomId: ROOM_ID, expectedSettingsVersion: 1 })

  // 그 사이 설정이 바뀌어 서버가 전원 준비를 해제한 스냅샷이 도착한다.
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

  // 이제야 옛 ACK가 도착한다(성공 응답이지만 v1을 근거로 한 것이다).
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
  // 늦은 finally가 새 잠금을 대신 풀어 버리지 않는다(지금은 진행 중인 준비 요청이 없다).
  assert.equal(result.current.isSettingReady, false)

  // 최신 버전을 근거로 한 ACK는 그대로 반영된다.
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

  // 더 낮은 revision(중복 전달·순서 뒤바뀜)은 적용하지 않는다.
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: false, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 3,
    })
  })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "p1").isReady, true,
    "낮은 revision의 늦은 방송이 표시를 되돌렸다")
})

// ── AC-05: 사건과 조회의 순서 ───────────────────────────────────────────────

test("AC-05 · 같은 설정 버전의 방장 이전 뒤에 도착한 옛 전체 조회는 옛 방장을 되살리지 못한다", async () => {
  const { socket, result } = await mountVerified()
  const oldRoom = serverRoom({ hostUuid: "host-a" })
  const newHostRoom = serverRoom({ hostUuid: "p1" }) // 설정 버전은 그대로 1이다

  // 재접속 조회를 하나 띄워 붙잡아 둔다.
  socket.answer = () => HOLD
  await act(async () => { socket.trigger("connect") })
  assert.equal(result.current.isRoomVerified, false, "재조회 중에는 검증이 풀려야 한다")
  const queriesBefore = socket.countOf("get_current_room")

  // 그 사이 방장 이전이 도착한다. 설정 버전은 같다 — 버전만 보면 구분할 수 없는 경우다.
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: newHostRoom } : HOLD)
  await act(async () => {
    socket.trigger("host_changed", { hostUuid: "p1", canStart: false, roomId: ROOM_ID, settingsVersion: 1 })
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().hostUuid, "p1")
  assert.ok(socket.countOf("get_current_room") > queriesBefore,
    "무효화된 조회를 대신할 새 조회가 나가지 않았다")

  // 이제야 옛 조회 응답이 도착한다(옛 방장을 담고 있다).
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

  // 방송이 도착하면 진행 중이던 조회는 버려진다 — 버리기만 하면 영영 checking이다.
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

  // 뒤늦게 도착한 옛 조회 응답(v1)은 이 스냅샷을 덮지 못한다.
  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 1 }) })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2, "옛 조회가 새 설정을 덮었다")
})

// ── AC-05: 단절을 넘는 미확정 저장 ──────────────────────────────────────────

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

  // 응답이 오기 전에 연결이 끊긴다 — "실패"가 아니라 "결과를 모른다"이다.
  await act(async () => { socket.trigger("disconnect") })
  assert.equal(result.current.hasPendingSettingsResult, true,
    "단절이 미확정 저장의 requestId를 잃어버렸다")
  assert.equal(result.current.isSavingSettings, false, "잠금이 풀리지 않았다")

  // 재연결. 같은 계정·같은 방으로 돌아왔으므로 미확정 요청은 그대로 남아 있어야 한다.
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

  // 새 저장을 만들지 않고, 같은 requestId로 결과만 다시 묻는다.
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

  // 붙잡아 둔 옛 저장 응답이 뒤늦게 도착해도 상태를 다시 흔들지 않는다.
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

  // 방을 떠난다(단절과 달리 이 요청은 더 이상 적용될 수 없다).
  await act(async () => { useMatchingStore.getState().clearRoom() })
  assert.equal(result.current.hasPendingSettingsResult, false,
    "떠난 방의 저장 요청을 계속 붙잡고 있다")

  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, { ok: false, code: "NOT_IN_ROOM" })
    await savePromise
  })
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
