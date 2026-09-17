import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

/**
 * F-21(AC-01/AC-02/AC-04/AC-05/AC-06): **대기방 추방의 실제 소비 경계**를 그대로 검증한다.
 *
 * 여기서 도는 것은 화면이 실제로 쓰는 프로덕션 코드다 — useMatchingPage가 소비하는
 * useMatchingRoomKick, 인게임과 공유하는 useKickPlayerRequest, 그리고 서버 응답이 적재되는
 * 진짜 matchingStore(setRoom/removePlayer/clearRoom)다. 목록·소속·방 식별자를 손으로 만들어
 * 넣지 않는다 — 전부 서버 payload(buildRoomPayload와 같은 모양)를 store에 적재해서 얻는다.
 *
 * 대역은 소켓 하나뿐이다(서버 왕복이 없으므로). DOM 전역 설치 방식은 기존 훅 테스트
 * (kickPlayerFlow.test.js)와 동일하다.
 */
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// 실제 화면 코드가 쓰는 확인 대화상자/경고는 기록만 한다(사용자 입력을 기다리면 멈춘다).
installDomGlobal("alert", () => {})
installDomGlobal("confirm", () => false)

// useMatchingRoom은 `@/` 별칭을 쓰는 실제 화면 코드다 — Node ESM 기본 리졸버가 풀지 못하므로
// 기존 프론트 훅 시험들과 같은 로더를 등록한다(모듈 목킹이 아니라 경로 해석뿐이다).
register(new URL("../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useMatchingStore, selectRoomMembershipId, isCurrentRoomKickEvent } =
  await import("../../store/matchingStore.js")
const { useMatchingRoomKick } = await import("../useMatchingRoomKick.js")
const { useMatchingRoom } = await import("../useMatchingRoom.js")
const { KICK_REQUEST_STATUS } = await import("../../../ingame/hooks/useKickPlayerRequest.js")

const HOST = "uuid-host"
const TARGET = "uuid-target"
const OTHER = "uuid-other"

/**
 * emit을 기록하고 ack를 원하는 시점에 부를 수 있는 최소 소켓.
 *
 * useMatchingRoom도 이 대역으로 마운트한다 — 그쪽은 emitWithAck(get_current_room)와 이벤트
 * 구독(on/off)을 쓰므로 둘 다 갖춘다. trigger는 **서버가 보낸 사건**을 실제 수신기에
 * 흘려보내는 통로다(store를 직접 호출하는 대신 프로덕션 핸들러를 지나게 한다).
 */
function createFakeSocket({ answer = () => ({ ok: true, room: serverRoom() }) } = {}) {
  const emitted = []
  const listeners = new Map()
  const socket = {
    id: "sock-test",
    connected: true,
    emitted,
    answer,
    emit(event, payload, ack) { emitted.push({ event, payload, ack }) },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    timeout() { return socket },
    emitWithAck(event, payload) {
      emitted.push({ event, payload })
      return Promise.resolve(socket.answer(event, payload))
    },
  }
  return socket
}

/**
 * 서버 buildRoomPayload와 **같은 모양**의 방 응답. 참가자 항목의 membershipId와 방의
 * roomInstanceId/bootEpoch는 서버가 발급하는 값이고, 화면은 그대로 적재만 한다.
 */
function serverRoom(overrides = {}) {
  return {
    roomId: "room-1",
    roomCode: "CODE11",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    hostUuid: HOST,
    canStart: false,
    accessType: "PRIVATE",
    settings: { maxPlayers: 8, jokerCount: 1 },
    settingsVersion: 1,
    players: [
      { uuid: HOST, nickname: "호스트", isReady: true, readyRevision: 3, membershipId: "mem-host" },
      { uuid: TARGET, nickname: "대상", isReady: false, readyRevision: 1, membershipId: "mem-target" },
      { uuid: OTHER, nickname: "잔류", isReady: true, readyRevision: 7, membershipId: "mem-other" },
    ],
    ...overrides,
  }
}

function setUp({ room = serverRoom(), me = HOST, socket = createFakeSocket() } = {}) {
  act(() => {
    useAuthStore.setState({ user: { uuid: me }, isLoggedIn: true })
    useMatchingStore.getState().setRoom(room)
  })
  setSocket(socket)
  return socket
}

/** 화면이 실제로 쓰는 진입 조건 그대로 훅을 띄운다(방 검증을 마친 대기방). */
function mountKick({ isRoomVerified = true } = {}) {
  return renderHook(() => useMatchingRoomKick({ isRoomVerified }))
}

/** useMatchingPage처럼 메모된 콜백을 쓴다 — 렌더마다 방 동기화를 다시 시작하지 않게 한다. */
const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }

/**
 * **실제 대기방 페이지의 두 훅을 함께** 띄운다(useMatchingPage가 하는 것과 같은 조합).
 *
 * 서버 사건은 useMatchingRoom이 구독하므로, 그 수신기를 지나지 않고 store를 직접 부르면
 * 화면이 실제로 통과시키는 소속·출처·세대 검사를 전혀 검증하지 못한다.
 */
async function mountRoomAndKick({ me = HOST } = {}) {
  const socket = setUp({ me })
  const rendered = renderHook(() => {
    const room = useMatchingRoom(roomCallbacks)
    const kick = useMatchingRoomKick({ isRoomVerified: room.isRoomVerified })
    return { ...room, ...kick }
  })
  // 최초 get_current_room 확인이 끝나야 이 화면이 그 방의 사건을 받아들인다.
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(rendered.result.current.isRoomVerified, true, "최초 방 검증이 끝나지 않았다")
  return { socket, ...rendered }
}

test.afterEach(() => {
  cleanup()
  act(() => {
    useMatchingStore.getState().clearRoom()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
})

// ── 서버 적재 계약 ────────────────────────────────────────────────────────────

test("AC-02: setRoom은 서버가 준 방 인스턴스·기동·참가자 소속을 그대로 적재한다", () => {
  setUp()
  const state = useMatchingStore.getState()

  assert.equal(state.roomInstanceId, "inst-1")
  assert.equal(state.bootEpoch, "boot-1")
  assert.equal(selectRoomMembershipId(state, HOST), "mem-host")
  assert.equal(selectRoomMembershipId(state, TARGET), "mem-target")
  // 서버가 소속을 싣지 않은 계정은 "지목할 수 없음"이지 임의의 값이 아니다.
  assert.equal(selectRoomMembershipId(state, "없는사람"), null)
})

test("AC-05: clearRoom은 방 식별자까지 함께 지운다(다음 방의 사건이 옛 인스턴스로 통과하지 않는다)", () => {
  setUp()
  act(() => useMatchingStore.getState().clearRoom())
  const state = useMatchingStore.getState()

  assert.equal(state.roomInstanceId, null)
  assert.equal(state.bootEpoch, null)
  assert.deepEqual(state.players, [])
})

// ── AC-01: 권한 ──────────────────────────────────────────────────────────────

test("AC-01: 비방장에게는 추방 진입이 없고, 강행해도 요청이 0회다", () => {
  const socket = setUp({ me: TARGET })
  const { result } = mountKick()

  assert.equal(result.current.canKick, false)
  act(() => result.current.openKickModal())
  assert.equal(result.current.kickModalOpen, false, "비방장 화면에는 모달 자체가 열리지 않는다")

  // 화면 상태를 우회해 직접 호출해도 서버로 나가는 요청은 없다(buildRequest가 막는다).
  act(() => result.current.requestKickConfirm({ uuid: HOST, nickname: "호스트", membershipId: "mem-host" }))
  act(() => result.current.confirmKick())
  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.kickErrorCode, "NOT_READY")
})

test("AC-01: 방 검증 전에는 방장에게도 진입이 열리지 않는다", () => {
  setUp()
  const { result } = mountKick({ isRoomVerified: false })
  assert.equal(result.current.canKick, false)
})

test("AC-01: 확인을 연 뒤 방장이 바뀌면 그 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => useMatchingStore.getState().updateHost(OTHER, false))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.FAILED)
})

// ── AC-02: 목록·확인·전송 ────────────────────────────────────────────────────

test("AC-02: 목록은 서버 명단 그대로이며 본인만 빠진다", () => {
  setUp()
  const { result } = mountKick()

  assert.deepEqual(result.current.kickTargets, [
    { uuid: TARGET, nickname: "대상", membershipId: "mem-target" },
    { uuid: OTHER, nickname: "잔류", membershipId: "mem-other" },
  ])
})

test("AC-02: 서버가 소속을 싣지 않은 참가자는 지목 대상이 되지 않는다", () => {
  const room = serverRoom()
  delete room.players[1].membershipId
  setUp({ room })
  const { result } = mountKick()

  assert.deepEqual(result.current.kickTargets.map((entry) => entry.uuid), [OTHER])
})

test("AC-02: 확인 취소는 소켓 요청을 한 번도 보내지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.openKickModal())
  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.CONFIRMING)
  assert.equal(result.current.kickPendingTarget.uuid, TARGET)
  assert.equal(socket.emitted.length, 0)

  act(() => result.current.cancelKickConfirm())
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.IDLE)
  assert.equal(result.current.kickPendingTarget, null)
  assert.equal(socket.emitted.length, 0)
})

test("AC-02: 모달을 닫으면 확인 중이던 대상도 함께 정리된다(다음에 열 때 옛 확인이 없다)", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.openKickModal())
  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.closeKickModal())

  assert.equal(result.current.kickModalOpen, false)
  assert.equal(result.current.kickPendingTarget, null)
  assert.equal(socket.emitted.length, 0)
})

test("AC-02: 승인은 서버 값만으로 만든 payload를 kick_room_player로 정확히 한 번 보낸다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 1)
  const sent = socket.emitted[0]
  assert.equal(sent.event, "kick_room_player")
  // 화면이 만드는 값은 requestId뿐이다. gameId는 대기방 명령에 실리지 않는다.
  assert.deepEqual(Object.keys(sent.payload).sort(), [
    "bootEpoch", "requestId", "requesterMembershipId",
    "roomId", "roomInstanceId", "targetMembershipId", "targetUuid",
  ])
  assert.equal(sent.payload.roomId, "room-1")
  assert.equal(sent.payload.roomInstanceId, "inst-1")
  assert.equal(sent.payload.bootEpoch, "boot-1")
  assert.equal(sent.payload.requesterMembershipId, "mem-host")
  assert.equal(sent.payload.targetUuid, TARGET)
  assert.equal(sent.payload.targetMembershipId, "mem-target")
  assert.equal(result.current.isKicking, true)
})

test("AC-02: 전송 중 연속 클릭은 두 번째 요청을 만들지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())
  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 1)
})

test("AC-02: 성공 뒤 서버 player_left_room 반영은 잔류자의 준비값을 그대로 두고 인원만 줄인다", async () => {
  // 명단은 화면이 고치지 않는다 — 서버 사건이 **실제 수신기를 지나** canStart와 함께 반영한다.
  const { socket } = await mountRoomAndKick()

  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-1", canStart: true,
  }))

  const state = useMatchingStore.getState()
  assert.deepEqual(state.players.map((p) => p.uuid), [HOST, OTHER])
  assert.equal(state.players.find((p) => p.uuid === OTHER).isReady, true)
  assert.equal(state.players.find((p) => p.uuid === OTHER).readyRevision, 7)
  assert.equal(state.canStart, true, "canStart는 서버 계산값을 그대로 쓴다")
  // 추방된 대상만 빠졌고 방장 자신의 소속·준비는 그대로다.
  assert.equal(selectRoomMembershipId(state, HOST), "mem-host")
  assert.equal(selectRoomMembershipId(state, TARGET), null)
})

test("AC-02/AC-05: 이미 빠진 소속의 늦은 player_left_room은 옛 canStart로 현재 집계를 되돌리지 않는다", async () => {
  const { socket } = await mountRoomAndKick()

  // 서버가 확정한 제거가 먼저 반영된다(추방 직후의 정상 사건).
  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-1", canStart: true,
  }))
  assert.equal(useMatchingStore.getState().canStart, true)

  // 그 뒤 **같은 소속**의 사건이 한 번 더 도착한다(재전달, 또는 추방과 겹친 자발적 이탈).
  // 명단에서는 이미 사라졌으므로 제거 자체는 무해해 보이지만, 함께 실린 옛 canStart는 아니다.
  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-1", canStart: false,
  }))

  const state = useMatchingStore.getState()
  assert.deepEqual(state.players.map((p) => p.uuid), [HOST, OTHER])
  assert.equal(state.canStart, true, "이미 지나온 사건의 옛 canStart가 현재 집계를 덮었다")
})

test("AC-05/AC-06: 같은 계정이 새 소속으로 다시 앉은 뒤 도착한 옛 이탈 사건은 새 참가자를 지우지 않는다", async () => {
  const { socket } = await mountRoomAndKick()

  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-1", canStart: true,
  }))
  act(() => socket.trigger("player_joined_room", {
    player: { uuid: TARGET, nickname: "대상", isReady: false, membershipId: "mem-target-2" },
    canStart: false,
  }))

  // 옛 소속을 가리키는 사건이 이제야 도착한다.
  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-1", canStart: true,
  }))

  const state = useMatchingStore.getState()
  assert.equal(selectRoomMembershipId(state, TARGET), "mem-target-2", "새 소속이 옛 사건으로 사라졌다")
  assert.equal(state.canStart, false, "옛 사건의 canStart가 새 참가자 이후의 집계를 덮었다")
})

test("AC-02: 다른 방을 가리키는 이탈 사건은 이 방의 명단·집계를 건드리지 않는다", async () => {
  const { socket } = await mountRoomAndKick()

  act(() => socket.trigger("player_left_room", {
    uuid: TARGET, membershipId: "mem-target", roomId: "room-2", canStart: true,
  }))

  const state = useMatchingStore.getState()
  assert.deepEqual(state.players.map((p) => p.uuid), [HOST, TARGET, OTHER])
  assert.equal(state.canStart, false)
})

// ── AC-04: 거부 · 미확인 결과 ────────────────────────────────────────────────

test("AC-04: 확인 도중 대상이 나갔다 다시 들어오면(새 소속) 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  // 같은 uuid가 새 소속으로 다시 앉았다(서버가 새 membershipId를 발급한다 — AC-06).
  act(() => {
    useMatchingStore.getState().removePlayer(TARGET, false)
    useMatchingStore.getState().addPlayer(
      { uuid: TARGET, nickname: "대상", isReady: false, membershipId: "mem-target-2" }, false)
  })
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.kickErrorCode, "STALE_MEMBERSHIP")
})

test("AC-04: 확인 도중 다른 방으로 옮겨가면 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => useMatchingStore.getState().setRoom(serverRoom({
    roomId: "room-2", roomInstanceId: "inst-2",
  })))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.kickErrorCode, "STALE_MEMBERSHIP")
})

test("AC-04: 같은 roomId라도 방 인스턴스가 바뀌면 옛 확인은 무효다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => useMatchingStore.getState().setRoom(serverRoom({ roomInstanceId: "inst-2" })))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickErrorCode, "STALE_MEMBERSHIP")
})

test("AC-04: 서버가 방 식별자를 싣지 않은 방에서는 아예 보내지 않는다(추측하지 않는다)", () => {
  const socket = setUp({ room: serverRoom({ roomInstanceId: null, bootEpoch: null }) })
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.kickErrorCode, "NOT_READY")
})

test("AC-04: ACK를 놓치면 성공으로 표시하지 않고, 결과 조회의 UNKNOWN도 성공으로 승격하지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())
  // ack가 끝내 오지 않는다. 화면은 여전히 "보내는 중"이고 성공이 아니다.
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.SENDING)
  assert.equal(result.current.canLookupKickResult, true)

  act(() => result.current.lookupKickResult())
  const lookup = socket.emitted[1]
  assert.equal(lookup.event, "get_kick_result")
  // 새 추방을 다시 보내지 않는다 — 기존 키만 묻는다.
  assert.deepEqual(Object.keys(lookup.payload).sort(), ["bootEpoch", "requestId"])
  assert.equal(lookup.payload.requestId, socket.emitted[0].payload.requestId)

  act(() => lookup.ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(socket.emitted.length, 2, "UNKNOWN이 자동 재전송을 만들지 않는다")
})

test("AC-04: 서버 거부 코드는 그대로 표시되고 확인은 되돌아간다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())
  act(() => socket.emitted[0].ack({ ok: false, code: "ALREADY_LEFT" }))

  assert.equal(result.current.kickStatus, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.kickErrorCode, "ALREADY_LEFT")
  assert.equal(result.current.kickPendingTarget, null)
})

// ── AC-05: 세대 보호 ─────────────────────────────────────────────────────────

test("AC-05: 응답이 오기 전에 계정이 바뀌면 그 응답은 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())
  act(() => useAuthStore.setState({ user: { uuid: "다른계정" }, isLoggedIn: true }))
  act(() => socket.emitted[0].ack({ ok: true, status: "KICKED" }))

  assert.notEqual(result.current.kickStatus, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-05: 응답이 오기 전에 소켓이 교체되면 그 응답은 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestKickConfirm(result.current.kickTargets[0]))
  act(() => result.current.confirmKick())
  setSocket(createFakeSocket())
  act(() => socket.emitted[0].ack({ ok: true, status: "KICKED" }))

  assert.notEqual(result.current.kickStatus, KICK_REQUEST_STATUS.SUCCEEDED)
})

// ── AC-06: 개인 퇴장 사건 판정(순수 계약) ────────────────────────────────────

test("AC-02/AC-06: 개인 퇴장 사건은 방·인스턴스·기동·내 소속이 전부 맞을 때만 내 것이다", () => {
  setUp({ me: TARGET })
  const state = () => useMatchingStore.getState()
  const event = {
    roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1",
    targetUuid: TARGET, targetMembershipId: "mem-target",
  }

  assert.equal(isCurrentRoomKickEvent(state(), event), true)
  assert.equal(isCurrentRoomKickEvent(state(), { ...event, roomId: "room-2" }), false)
  assert.equal(isCurrentRoomKickEvent(state(), { ...event, roomInstanceId: "inst-2" }), false)
  assert.equal(isCurrentRoomKickEvent(state(), { ...event, bootEpoch: "boot-2" }), false)
  assert.equal(isCurrentRoomKickEvent(state(), { ...event, targetMembershipId: "mem-target-2" }), false)
  assert.equal(isCurrentRoomKickEvent(state(), { ...event, targetUuid: OTHER }), false)

  // 같은 방에 **다시 들어온** 뒤 도착한 옛 사건은 새 소속을 지우지 못한다.
  act(() => {
    useMatchingStore.getState().removePlayer(TARGET, false)
    useMatchingStore.getState().addPlayer(
      { uuid: TARGET, nickname: "대상", isReady: false, membershipId: "mem-target-2" }, false)
  })
  assert.equal(isCurrentRoomKickEvent(state(), event), false)

  // 방을 떠난 뒤 도착한 사건도 마찬가지다.
  act(() => useMatchingStore.getState().clearRoom())
  assert.equal(isCurrentRoomKickEvent(state(), event), false)
})
