/**
 * F-20 AC-04/AC-05 — **응답 하나가 말하는 사실은 한 가지가 아니다**의 회귀.
 *
 * 두 관찰을 각각 재현한다.
 *
 *   1) 자기 준비 ACK의 own outcome(내 isReady·내 readyRevision)과 그 ACK가 함께 실어 온
 *      **방 전체** canStart는 서로 다른 사실이다. 내 revision이 현재라는 것은 내 준비 값이
 *      최신이라는 뜻일 뿐, 그 사이 다른 참가자의 준비로 바뀐 방 전체 집계까지 이 ACK가
 *      알고 있다는 뜻이 아니다.
 *
 *   2) 중간에 준비 사건 하나가 끼어들어 적용 세대가 올라갔다는 사실은 "더 새로운 **설정**을
 *      이미 확보했다"의 증거가 아니다. 그 이유로 응답의 방 스냅샷을 통째로 버리면, 화면은
 *      낡은 설정 버전에 머문 채 그 버전을 기대 버전으로 삼아 편집을 계속 허용한다.
 *
 * 실제 useMatchingRoom·실제 matchingStore를 그대로 쓴다. 소켓만 대역인데 모듈을 목업하지
 * 않고 실제 socketClient.setSocket으로 꽂으므로 이 파일은 추가 플래그 없이 돈다
 * (roomSyncStaleness.test.js와 같은 하니스·같은 관례).
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

/** emitWithAck 응답을 붙잡아 두라는 표식. */
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

/** 지금 store의 서버 확정 설정을 그대로 되보내는 폼 상태(값을 바꾸지 않는 저장). */
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

/** 저장 ACK를 timeout으로 잃어 "결과 미확인" 상태를 실제로 만든다. */
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

// ───────────────────────────────────────────────────────────────────────────
// 관찰 1 — 참가자 준비 revision은 방 전체 canStart를 정렬하지 못한다
// ───────────────────────────────────────────────────────────────────────────

test("AC-04 · 내 준비 revision이 현재여도, 그 뒤에 도착한 더 새로운 방 전체 canStart를 옛 ACK가 덮지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  // 내 준비 ACK를 붙잡아 둔다. 서버가 이것을 계산한 시점에는 P가 아직 준비 전이었다.
  socket.answer = (event) => (event === "set_ready" ? HOLD : HOLD)
  let readyPromise
  await act(async () => { readyPromise = result.current.setReady(true) })
  assert.equal(socket.countOf("set_ready"), 1)

  // 그 사이 P가 마지막으로 준비해 **방 전체**가 시작 가능해졌다(같은 설정 버전이다 —
  // 설정 버전으로는 이 사건을 구별할 수 없다).
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: true,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })
  assert.equal(useMatchingStore.getState().canStart, true, "전제가 깨졌다(P의 준비가 반영되지 않았다)")

  // 이제야 내 ACK가 도착한다. 내 revision(1)은 여전히 유효하지만, 이 응답이 실어 온
  // canStart=false는 P의 준비를 모르는 **그 이전** 집계다.
  await act(async () => {
    socket.release("set_ready", {
      ok: true, isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
    await readyPromise
    await Promise.resolve()
  })

  // (a) own outcome은 잃지 않는다.
  assert.equal(playerOf("host-a").isReady, true, "내 준비 결과가 사라졌다")
  assert.equal(playerOf("host-a").readyRevision, 1, "내 준비 revision이 반영되지 않았다")
  assert.equal(playerOf("p1").isReady, true, "다른 참가자의 준비가 되돌아갔다")
  // (b) 방 전체 값은 더 새로운 사실이 이긴다.
  assert.equal(useMatchingStore.getState().canStart, true,
    "옛 ACK의 방 전체 canStart가 더 새로운 값을 덮었다")
  // (c) 낡은 집계를 그대로 두고 끝내지 않는다 — 권위 있는 현재 방을 제한된 조회 한 번으로
  //     다시 확보한다(로컬 전원-준비 계산으로 추측하지 않는다).
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "권위 있는 수렴 조회가 정확히 한 번 나가지 않았다")

  // 그 조회가 돌아오면 서버가 확정한 값으로 수렴한다.
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

  // 서버는 내 준비로 전원 준비를 확인했지만(그 ACK가 canStart=true를 들고 온다), 그 직후
  // P가 준비를 취소해 방 전체는 다시 시작 불가가 됐고 그 방송이 **먼저** 도착했다.
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

  // 지금 이 ACK가 방 전체에 대해서도 가장 새로운 사실이다 — 그대로 반영한다.
  assert.equal(useMatchingStore.getState().canStart, true, "유효한 현재 ACK의 canStart가 버려졌다")
  assert.equal(playerOf("host-a").isReady, true)
  assert.equal(playerOf("host-a").readyRevision, 3)
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "유효한 현재 ACK가 불필요한 조회를 만들었다")
})

// ───────────────────────────────────────────────────────────────────────────
// 관찰 2 — 끼어든 준비 사건은 "더 새로운 설정을 이미 받았다"의 증거가 아니다
// ───────────────────────────────────────────────────────────────────────────

test("AC-05 · 결과 조회 중 끼어든 옛 준비 방송 때문에 응답이 드러낸 더 새로운 설정을 놓치지 않는다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")
  const savesBefore = socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)

  // 결과 조회를 붙잡아 둔다.
  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })
  assert.equal(socket.countOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT), 1)

  // 그 사이 **v1에서 발행된** 준비 방송이 늦게 도착한다. 이것은 방 상태를 진전시키지만
  // 설정에 대해서는 아무 새 정보도 아니다(여전히 v1이다).
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 1)

  // 이제 결과가 도착한다 — 내 저장은 실제로 적용됐고(v2), 그 설정 방송은 우리가 놓쳤다.
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

  // 원 요청의 정착은 그대로다(추측으로 다시 저장하지 않는다).
  const settled = await verifyPromise
  assert.equal(settled.ok, true)
  assert.equal(settled.status, "APPLIED")
  assert.equal(result.current.hasPendingSettingsResult, false, "원 요청이 정착하지 않았다")
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), savesBefore,
    "결과 확인이 자동 재저장을 만들었다")

  // 더 새로운 설정 버전이 드러났으므로 최신 설정을 **권위 있게** 다시 확보해야 한다.
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

  // 응답을 기다리는 사이 v1의 준비 방송이 도착한다(설정에 대해서는 새 정보가 아니다).
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false,
      roomId: ROOM_ID, settingsVersion: 1, readyRevision: 1,
    })
  })

  // 서버는 **그 사이 설정이 이미 v2로 바뀌었다**며 거부하고 최신 방을 함께 돌려준다.
  await act(async () => {
    socket.release(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
      ok: false, code: "SETTINGS_VERSION_CONFLICT", message: "방 설정이 변경되었습니다.",
      room: serverRoom({ settingsVersion: 2 }),
    })
    await savePromise
    await Promise.resolve()
  })

  // 실패 자체는 그대로 알린다(원 요청의 결과를 바꾸지 않는다).
  assert.equal(result.current.settingsError?.code, "SETTINGS_VERSION_CONFLICT")
  // 더 새로운 설정 버전이 드러났으므로 재확보 조회가 나가야 한다.
  assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
    "거부 응답이 드러낸 더 새로운 설정을 확보하지 않았다")

  await act(async () => {
    socket.release("get_current_room", { ok: true, room: serverRoom({ settingsVersion: 2 }) })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2,
    "거부 뒤에도 화면이 낡은 기대 버전에 머물렀다")
})

// ── 보존 가드 — 반대 방향의 통제가 그대로 살아 있어야 한다 ──────────────────

test("AC-05 · 보존 · 이미 더 새로운 설정 방송을 반영했다면 옛 스냅샷을 실은 결과는 그것을 되돌리지도, 조회를 만들지도 않는다", async () => {
  const { socket, result } = await mountVerified()
  await createPendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = () => HOLD
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })

  // 그 사이 **진짜 더 새로운 설정 방송**(v2)을 이미 받아 반영했다.
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

  // 결과 응답은 그보다 **오래된** 스냅샷(v1)을 싣고 있다.
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

  // 서버는 역사적 결과는 알려주면서 room을 비웠다 — 더 이상 이 계정을 그 방에 두고 있지 않다.
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
