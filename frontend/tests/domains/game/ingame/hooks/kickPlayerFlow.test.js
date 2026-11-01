import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act, createElement } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

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
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("KeyboardEvent", dom.window.KeyboardEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `portrait-${index}`,
    pickInGamePlayerFrame: (index) => `frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc) => frameSrc,
    resolveAccountCardFrameSrc: () => null,
  },
})
mock.module("../../../../../src/domains/user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
    saveEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
  },
})

const { renderHook, render, cleanup, fireEvent } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { applyTribunalResolvedPure } = await import("../../../../../src/domains/game/ingame/store/applyTribunalResolved.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useKickPlayerRequest, KICK_REQUEST_STATUS } = await import("../../../../../src/domains/game/ingame/hooks/useKickPlayerRequest.js")
const { useInGameSettingIsHost } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSettingIsHost.js")
const { useInGameDayVoteSubmit } = await import("../../../../../src/domains/game/ingame/hooks/useInGameDayVoteSubmit.js")
const { applySessionSnapshotPure } = await import("../../../../../src/domains/game/ingame/utils/snapshot/applySnapshot.js")
const { default: SettingKickPlayerModal } = await import(
  "../../../../../src/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModal.jsx")
const { InGameActionProvider } = await import("../../../../../src/domains/game/ingame/pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../../../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { default: InGamePlayerBoard } = await import("../../../../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import(
  "../../../../../src/domains/game/ingame/components/board/InGamePlayerCardMenu.jsx")
const { INGAME_CARD_MENU_DAY_VOTE_LABEL } = await import("../../../../../src/domains/game/ingame/hooks/useInGamePlayerCardMenu.js")
const { INGAME_E2E_ATTRS } = await import("../../../../../src/domains/game/ingame/constants/ingameE2eHooks.js")

const HOST = "uuid-host"
const TARGET = "uuid-target"

function createFakeSocket({ id = "sock-ingame" } = {}) {
  const emitted = []
  return {
    id,
    emitted,
    emit(event, payload, ack) {
      emitted.push({ event, payload, ack })
    },
    on() {},
    off() {},
  }
}

function gameState(overrides = {}) {
  return {
    id: "game-1",
    phase: "DAY",
    dayIndex: 1,
    hostUuid: HOST,
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    participationRevision: 0,
    players: [
      { uuid: HOST, nickname: "호스트", alive: true, isParticipating: true, membershipId: "mem-host" },
      { uuid: TARGET, nickname: "대상", alive: true, isParticipating: true, membershipId: "mem-target" },
    ],
    self: { uuid: HOST, nickname: "호스트", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    ...overrides,
  }
}

function mountKick({ verifyMembership = null } = {}) {
  const buildRequest = ({ target, requestId }) => {
    const current = useInGameStore.getState()
    const state = current.state
    if (!current.gameId || !state) return null
    const requesterMembershipId = (state.players ?? []).find((p) => p.uuid === HOST)?.membershipId ?? null
    if (!requesterMembershipId || !target.membershipId) return null
    return {
      requestId,
      bootEpoch: state.bootEpoch,
      roomId: state.roomId,
      roomInstanceId: state.roomInstanceId,
      requesterMembershipId,
      targetUuid: target.uuid,
      targetMembershipId: target.membershipId,
      gameId: current.gameId,
    }
  }
  return renderHook(() => useKickPlayerRequest({
    scope: "GAME",
    buildRequest,
    getMembershipScopeId: () => useInGameStore.getState().gameId ?? null,
    verifyMembership,
  }))
}

function currentTargets() {
  return (useInGameStore.getState().state?.players ?? [])
    .filter((p) => p.uuid !== HOST && p.isParticipating !== false)
    .map((p) => ({ uuid: p.uuid, nickname: p.nickname, membershipId: p.membershipId }))
}

function setUp(socket = createFakeSocket()) {
  act(() => {
    useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({ gameId: "game-1", state: gameState() })
  })
  setSocket(socket)
  return socket
}

test.afterEach(() => {
  cleanup()
  act(() => {
    useInGameStore.getState().clearGame()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
})

const { INGAME_KICK_PLAYER_MODAL_COPY } = await import(
  "../../../../../src/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js")

function mountRealModal() {
  const view = render(createElement(SettingKickPlayerModal, { open: true, onClose: () => {} }))
  return view
}

const byTestId = (id) => document.body.querySelector(`[data-testid="${id}"]`)

function clickRowKick(nickname) {
  const buttons = [...document.body.querySelectorAll("li button")]
  const row = buttons.find((b) => b.closest("li")?.textContent?.includes(nickname))
  assert.ok(row, `${nickname} 행의 추방 버튼을 찾지 못했다`)
  assert.equal(row.getAttribute("aria-label"), INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel)
  act(() => { row.click() })
}

function clickTestId(id) {
  const el = byTestId(id)
  assert.ok(el, `${id}를 찾지 못했다`)
  act(() => { el.click() })
}

function driveModalToHeldSnapshotRefresh(socket) {
  mountRealModal()
  clickRowKick("대상")
  clickTestId("kick-confirm-accept")
  const sent = socket.emitted.find((e) => e.event === "kick_game_player")
  assert.ok(sent, "kick_game_player가 나가지 않았다")

  clickTestId("kick-lookup-result")
  const lookup = socket.emitted.find((e) => e.event === "get_kick_result")
  assert.ok(lookup, "결과 조회가 나가지 않았다")
  act(() => { lookup.ack({ ok: true, status: "UNKNOWN" }) })

  const refresh = socket.emitted.find((e) => e.event === "get_session_snapshot")
  assert.ok(refresh, "UNKNOWN 뒤 실제 스냅샷 재확인이 시작되지 않았다")
  assert.ok(byTestId("kick-awaiting-resolution"), "재확인 대기 안내가 없다")
  return refresh
}

function serverSnapshot(overrides = {}) {
  return {
    ok: true,
    gameId: "game-1",
    phase: "DAY",
    dayPhase: "DAY_DISCUSSION",
    dayIndex: 1,
    hostUuid: HOST,
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    participationRevision: 1,
    players: [
      { uuid: HOST, nickname: "호스트", isAlive: true, isConnected: true, isParticipating: true, membershipId: "mem-host" },
      { uuid: TARGET, nickname: "대상", isAlive: true, isConnected: true, isParticipating: true, membershipId: "mem-target" },
    ],
    self: { uuid: HOST, nickname: "호스트", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    ...overrides,
  }
}

async function releaseRefresh(refresh, response) {
  await act(async () => { refresh.ack(response) })
}

test("AC-04: 실제 모달의 재확인은 아무것도 바뀌지 않았을 때 스냅샷을 적용하고 잠금을 푼다", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  await releaseRefresh(refresh, serverSnapshot({
    participationRevision: 2,
    players: serverSnapshot().players.map((p) =>
      (p.uuid === TARGET ? { ...p, isParticipating: false } : p)),
  }))

  const state = useInGameStore.getState().state
  assert.equal(state.participationRevision, 2, "정상 재확인이 적용되지 않았다")
  assert.equal(state.players.find((p) => p.uuid === TARGET).isParticipating, false)
  assert.equal(byTestId("kick-awaiting-resolution"), null, "성공한 재확인 뒤에도 잠금이 남았다")
})

test("AC-04: 반영되지 않은 응답은 재확인 성공이 아니다(잠금이 풀리지 않는다)", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  await releaseRefresh(refresh, serverSnapshot({
    participationRevision: 3,
    players: [serverSnapshot().players[0]],
  }))

  assert.equal(useInGameStore.getState().state.participationRevision, 0, "거부돼야 하는 응답이 적용됐다")
  assert.ok(byTestId("kick-awaiting-resolution"), "반영되지 않았는데 잠금이 풀렸다")
})

test("AC-05: 같은 Socket이 재연결되면(id만 새로) 실제 모달의 재확인 ACK는 적용되지 않는다", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  socket.id = "sock-reconnected"

  const before = useInGameStore.getState().state
  await releaseRefresh(refresh, serverSnapshot({ participationRevision: 9 }))

  assert.equal(useInGameStore.getState().state, before, "재연결 뒤 옛 ACK가 스냅샷을 적용했다")
  assert.ok(byTestId("kick-awaiting-resolution"), "적용되지 않았는데 잠금이 풀렸다")
})

test("AC-05: A→B→A 계정 전이 뒤 도착한 실제 모달의 재확인 ACK는 적용되지 않는다", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  act(() => useAuthStore.getState().logout())
  act(() => useAuthStore.getState().login({ uuid: HOST }))

  const before = useInGameStore.getState().state
  await releaseRefresh(refresh, serverSnapshot({ participationRevision: 9 }))

  assert.equal(useInGameStore.getState().state, before, "계정 전이 뒤 옛 ACK가 스냅샷을 적용했다")
})

test("AC-05: 재확인을 보낸 뒤 더 새로운 참여 사건이 반영되면 옛 ACK는 적용되지 않는다", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  act(() => useInGameStore.getState().applyParticipationChanged({
    gameId: "game-1",
    participationRevision: 5,
    hostUuid: HOST,
    players: [
      { uuid: HOST, membershipId: "mem-host", isParticipating: true },
      { uuid: TARGET, membershipId: "mem-target", isParticipating: false },
    ],
  }))
  const afterEvent = useInGameStore.getState().state
  assert.equal(afterEvent.participationRevision, 5)

  await releaseRefresh(refresh, serverSnapshot({ participationRevision: 6 }))

  assert.equal(useInGameStore.getState().state, afterEvent, "더 새로운 참여 사건이 옛 ACK에 덮였다")
  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === TARGET).isParticipating, false,
    "옛 ACK가 참여 종료를 되돌렸다",
  )
})

test("AC-05: 다른 판을 가리키는 재확인 응답은 현재 판에 적용되지 않는다", async () => {
  const socket = setUp()
  const refresh = driveModalToHeldSnapshotRefresh(socket)

  const before = useInGameStore.getState().state
  await releaseRefresh(refresh, serverSnapshot({ gameId: "game-9" }))

  assert.equal(useInGameStore.getState().state, before)
  assert.ok(byTestId("kick-awaiting-resolution"))
})

test("AC-02: 확인 취소는 소켓 요청을 한 번도 보내지 않고 상태를 되돌린다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.CONFIRMING)
  assert.equal(result.current.pendingTarget.uuid, TARGET)
  assert.equal(socket.emitted.length, 0, "확인 단계는 요청을 보내지 않는다")

  act(() => result.current.cancelConfirm())
  assert.equal(result.current.status, KICK_REQUEST_STATUS.IDLE)
  assert.equal(result.current.pendingTarget, null)
  assert.equal(socket.emitted.length, 0)
})

test("AC-02: 확인 승인은 서버 값만으로 만든 payload를 kick_game_player로 정확히 한 번 보낸다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 1)
  const sent = socket.emitted[0]
  assert.equal(sent.event, "kick_game_player")
  assert.deepEqual(Object.keys(sent.payload).sort(), [
    "bootEpoch", "gameId", "requestId", "requesterMembershipId",
    "roomId", "roomInstanceId", "targetMembershipId", "targetUuid",
  ])
  assert.equal(sent.payload.bootEpoch, "boot-1")
  assert.equal(sent.payload.roomInstanceId, "inst-1")
  assert.equal(sent.payload.requesterMembershipId, "mem-host")
  assert.equal(sent.payload.targetMembershipId, "mem-target")
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)

  act(() => sent.ack({ ok: true, status: "KICKED" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-02: 전송 중에는 같은 대상을 다시 확인할 수 없어 연속 클릭이 두 번째 요청을 만들지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 1)
})

test("AC-04: 확인 도중 대상이 나갔다 다시 들어오면(새 소속) 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))

  act(() => {
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((p) =>
          (p.uuid === TARGET ? { ...p, membershipId: "mem-target-2" } : p)),
      },
    }))
  })

  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 0, "옛 확인으로 새 소속을 추방하지 않는다")
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "STALE_MEMBERSHIP")
  assert.equal(result.current.pendingTarget, null, "새 확인 절차를 다시 밟아야 한다")
})

test("AC-04: 확인 도중 다른 판으로 옮겨가면 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({ gameId: "game-2", state: gameState({ id: "game-2" }) })
  })

  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 0)
  assert.equal(result.current.errorCode, "STALE_MEMBERSHIP")
})

test("AC-04: ACK를 놓치면 성공으로 표시하지 않고, 결과 재조회의 UNKNOWN도 성공으로 승격하지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)
  assert.equal(result.current.canLookupResult, true)

  act(() => result.current.lookupResult())
  const lookup = socket.emitted[1]
  assert.equal(lookup.event, "get_kick_result")
  assert.deepEqual(Object.keys(lookup.payload).sort(), ["bootEpoch", "requestId"])
  assert.equal(lookup.payload.requestId, socket.emitted[0].payload.requestId)

  act(() => lookup.ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.notEqual(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-04: 결과 재조회가 KICKED를 돌려주면 그때 비로소 성공으로 확정된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "KICKED", replayed: true }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-04: 서버가 거부하면 그 코드를 그대로 표시하고 목록·확인을 되돌린다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => socket.emitted[0].ack({ ok: false, code: "NOT_HOST" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "NOT_HOST")
  assert.equal(result.current.pendingTarget, null)
})

test("AC-05: 응답이 돌아오기 전에 계정이 바뀌면 그 응답은 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  const pending = socket.emitted[0]

  act(() => { useAuthStore.setState({ user: { uuid: "다른-계정" }, isLoggedIn: true }) })
  const statusAfterSwitch = result.current.status

  act(() => pending.ack({ ok: true, status: "KICKED" }))

  assert.equal(result.current.status, statusAfterSwitch)
  assert.notEqual(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-05: 응답이 돌아오기 전에 소켓이 교체되면 그 응답은 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  const pending = socket.emitted[0]

  setSocket(createFakeSocket())
  act(() => pending.ack({ ok: true, status: "KICKED" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)
})

test("AC-05: 뒤에 시작된 조회가 있으면 앞선 조회의 늦은 ACK는 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  act(() => result.current.lookupResult())
  const staleLookup = socket.emitted[1]
  act(() => result.current.lookupResult())
  const currentLookup = socket.emitted[2]
  assert.equal(socket.emitted.length, 3)

  act(() => staleLookup.ack({ ok: true, status: "KICKED", replayed: true }))
  assert.equal(
    result.current.status, KICK_REQUEST_STATUS.SENDING,
    "앞선 조회의 결과가 진행 중인 화면을 성공으로 덮었다",
  )

  act(() => currentLookup.ack({ ok: false, code: "STALE_SOCKET" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "STALE_SOCKET")
})

test("AC-02/AC-04: 결과를 모르는 전송이 남아 있으면 안내를 닫았다 열어도 두 번째 추방이 나가지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1)

  act(() => result.current.reset())
  assert.equal(result.current.status, KICK_REQUEST_STATUS.IDLE)

  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1, "닫기·열기만으로 미확인 전송이 우회됐다")

  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: false, replayed: true, code: "ALREADY_LEFT" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget?.uuid, TARGET)
})

test("AC-04: 조회 자체가 실패하면(STALE_SOCKET) 미확정 요청의 보호가 풀리지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1)

  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: false, code: "STALE_SOCKET" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "STALE_SOCKET")

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 2, "조회 실패 뒤에 새 추방이 나갔다")

  assert.equal(result.current.canLookupResult, true)
  act(() => result.current.lookupResult())
  assert.equal(socket.emitted[2].event, "get_kick_result")
  assert.equal(socket.emitted[2].payload.requestId, socket.emitted[1].payload.requestId)
  act(() => socket.emitted[2].ack({ ok: true, status: "KICKED", replayed: true }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-05: 같은 Socket 객체의 재연결(id 교체) 뒤 도착한 옛 ACK는 상태도 잠금도 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)

  socket.id = "sock-ingame-reconnected"
  act(() => socket.emitted[0].ack({ ok: true }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING, "옛 연결의 ACK가 성공으로 반영됐다")
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1, "옛 연결의 ACK가 전송 잠금을 풀었다")
})

test("AC-05: A→B→A 계정 전환이 한 번에 처리돼도 그 사이의 ACK는 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  act(() => {
    useAuthStore.getState().logout()
    useAuthStore.getState().login({ uuid: HOST })
  })
  act(() => socket.emitted[0].ack({ ok: true }))

  assert.notEqual(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
})

test("AC-04: UNKNOWN 재확인이 끝나도 그 사이 시작된 **새 요청**의 잠금은 풀리지 않는다", () => {
  const socket = setUp()
  let release = null
  const verifyMembership = () => new Promise((resolve) => { release = resolve })
  const { result } = mountKick({ verifyMembership })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(result.current.isAwaitingResolution, true)

  act(() => result.current.lookupResult())
  assert.equal(socket.emitted.length, 3)

  return act(async () => { release(true) }).then(() => {
    assert.equal(result.current.isAwaitingResolution, true, "옛 재확인이 더 새로운 요청의 잠금을 풀었다")
  })
})

test("AC-02: 같은 렌더 안에서 confirmKick을 두 번 불러도 요청은 한 번뿐이다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  const targets = currentTargets()
  act(() => {
    result.current.confirmKick(targets)
    result.current.confirmKick(targets)
  })

  assert.equal(socket.emitted.length, 1)
  assert.equal(socket.emitted[0].event, "kick_game_player")
})

test("AC-04: UNKNOWN을 받으면 확인이 풀려 같은 확인으로 두 번째 추방이 나가지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(result.current.pendingTarget?.uuid, TARGET)

  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(result.current.pendingTarget, null, "UNKNOWN 뒤에는 지금 목록에서 다시 확인해야 한다")

  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 2, "UNKNOWN 상태에서 옛 확인으로 새 추방이 나갔다")
})

test("AC-04: UNKNOWN 뒤에는 서버 재확인이 **실제로** 일어나고, 성공하기 전에는 새 확인을 열 수 없다", async () => {
  const socket = setUp()
  const calls = []
  let release
  const verifyMembership = () => {
    calls.push(1)
    return new Promise((resolve) => { release = resolve })
  }
  const { result } = mountKick({ verifyMembership })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(calls.length, 1, "UNKNOWN인데 서버 재확인이 일어나지 않았다")
  assert.equal(result.current.isAwaitingResolution, true)

  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  assert.equal(socket.emitted.length, 2)

  await act(async () => { release(true) })
  assert.equal(result.current.isAwaitingResolution, false)
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget?.uuid, TARGET)
})

test("AC-04: 서버 재확인이 실패하면 잠긴 채로 남는다(모르는 상태를 화면이 풀지 않는다)", async () => {
  const socket = setUp()
  const { result } = mountKick({ verifyMembership: () => Promise.resolve(false) })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  await act(async () => { socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }) })

  assert.equal(result.current.isAwaitingResolution, true)
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  assert.equal(socket.emitted.length, 2)
})

test("AC-04: 재확인 대기 중이라도 다음 조회가 KICKED를 확정하면 요구가 풀리고 현재 목록의 다른 대상을 확인할 수 있다", async () => {
  const OTHER = "uuid-other"
  const socket = setUp()
  let release = null
  const verifyMembership = () => new Promise((resolve) => { release = resolve })
  const { result } = mountKick({ verifyMembership })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  const first = socket.emitted[0]
  assert.equal(first.event, "kick_game_player")

  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.isAwaitingResolution, true)
  assert.ok(release, "UNKNOWN인데 서버 재확인이 시작되지 않았다")

  act(() => result.current.lookupResult())
  act(() => socket.emitted[2].ack({ ok: true, status: "KICKED", replayed: true }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
  assert.equal(result.current.isAwaitingResolution, false, "결과를 알게 됐는데 재확인 요구가 남았다")

  await act(async () => { release(true) })
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
  assert.equal(result.current.isAwaitingResolution, false)
  assert.equal(socket.emitted.length, 3, "옛 재확인의 완료가 새 요청을 만들었다")

  act(() => {
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        players: [
          ...s.state.players.filter((p) => p.uuid !== TARGET),
          { uuid: OTHER, nickname: "다른 대상", alive: true, isParticipating: true, membershipId: "mem-other" },
        ],
      },
    }))
  })
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget?.uuid, OTHER)
  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 4)
  assert.equal(socket.emitted[3].event, "kick_game_player")
  assert.equal(socket.emitted[3].payload.targetUuid, OTHER)
  assert.equal(socket.emitted[3].payload.targetMembershipId, "mem-other")
  assert.notEqual(socket.emitted[3].payload.requestId, first.payload.requestId)
})

test("AC-04: 재확인 대기 중의 조회가 기록된 거부를 재생해도 요구가 풀리고, 뒤늦은 재확인 실패가 되돌리지 못한다", async () => {
  const socket = setUp()
  let release = null
  const verifyMembership = () => new Promise((resolve) => { release = resolve })
  const { result } = mountKick({ verifyMembership })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.isAwaitingResolution, true)

  act(() => result.current.lookupResult())
  act(() => socket.emitted[2].ack({ ok: false, replayed: true, code: "ALREADY_LEFT" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "ALREADY_LEFT")
  assert.equal(result.current.isAwaitingResolution, false)

  await act(async () => { release(false) })
  assert.equal(result.current.isAwaitingResolution, false, "옛 재확인의 실패가 확정된 결과를 다시 잠갔다")

  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget?.uuid, TARGET)
  assert.equal(socket.emitted.length, 3, "확인 단계가 요청을 보냈다")
})

test("AC-04: 재확인 대기 중의 조회가 전송 사유로 실패하면 요구도 잠금도 풀리지 않는다", async () => {
  const socket = setUp()
  const { result } = mountKick({ verifyMembership: () => new Promise(() => {}) })

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.isAwaitingResolution, true)

  act(() => result.current.lookupResult())
  act(() => socket.emitted[2].ack({ ok: false, code: "STALE_SOCKET" }))

  assert.equal(result.current.isAwaitingResolution, true, "조회 실패가 재확인 요구를 풀었다")
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 3, "조회 실패 뒤에 새 추방이 나갔다")
})

test("AC-05: 안내를 닫은 뒤 도착한 옛 ACK는 닫힌 안내를 되살리지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  const pending = socket.emitted[0]

  act(() => result.current.reset())
  assert.equal(result.current.status, KICK_REQUEST_STATUS.IDLE)

  act(() => pending.ack({ ok: false, code: "NOT_HOST" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.IDLE)
  assert.equal(result.current.errorCode, null)
  assert.equal(result.current.canLookupResult, true)
})

test("AC-03: session_participation_changed는 생존을 건드리지 않고 참여만 바꾸며 방장 승계를 반영한다", () => {
  setUp()
  act(() => {
    useInGameStore.getState().applyParticipationChanged({
      gameId: "game-1",
      phase: "DAY",
      dayIndex: 1,
      hostUuid: TARGET,
      participationRevision: 1,
      departedUuid: HOST,
      players: [
        { uuid: HOST, membershipId: "mem-host", alive: false, isParticipating: false },
        { uuid: TARGET, membershipId: "mem-target", alive: true, isParticipating: true },
      ],
    })
  })

  const state = useInGameStore.getState()
  assert.equal(state.state.players.find((p) => p.uuid === HOST).isParticipating, false)
  assert.equal(state.state.players.find((p) => p.uuid === HOST).alive, true)
  assert.equal(state.state.participationRevision, 1)
  assert.equal(state.hostUuid, TARGET)
})

test("AC-03: 이 사건 이전에 캡처된 낮은 세대는 최신 참여 상태를 되돌리지 못한다(완전한 no-op)", () => {
  setUp()
  const apply = (revision, participating) => act(() => {
    useInGameStore.getState().applyParticipationChanged({
      gameId: "game-1", phase: "DAY", dayIndex: 1, hostUuid: HOST,
      participationRevision: revision, departedUuid: HOST,
      players: [
        { uuid: HOST, membershipId: "mem-host", alive: true, isParticipating: true },
        { uuid: TARGET, membershipId: "mem-target", alive: true, isParticipating: participating },
      ],
    })
  })

  apply(2, false)
  const afterLatest = useInGameStore.getState().state
  apply(1, true)

  assert.equal(useInGameStore.getState().state, afterLatest, "참조까지 완전한 no-op이어야 한다")
  assert.equal(useInGameStore.getState().state.players.find((p) => p.uuid === TARGET).isParticipating, false)
})

test("AC-03: 피고 이탈 취소(CANCELLED)는 유죄 판정과 구별돼 tribunal을 비우고 같은 날 밤으로만 넘긴다", () => {
  const current = {
    gameId: "g1",
    state: {
      id: "g1", phase: "TRIBUNAL", dayIndex: 2,
      tribunal: { defendantUuid: "d1", resolved: false },
      players: [{ uuid: "d1", alive: true }, { uuid: "p2", alive: true }],
    },
  }
  const cancelled = {
    gameId: "g1", dayIndex: 2, phase: "NIGHT", defendantUuid: "d1",
    outcome: "CANCELLED", reason: "DEFENDANT_LEFT",
    counts: { guilty: 1, notGuilty: 0 }, executedUuid: null,
  }

  const next = applyTribunalResolvedPure(current, cancelled)
  assert.notEqual(next, current)
  assert.equal(next.state.phase, "NIGHT")
  assert.equal(next.state.tribunal, null)
  assert.equal(next.state.players.find((p) => p.uuid === "d1").alive, true)

  for (const bad of [
    { ...cancelled, phase: "ENDED" },
    { ...cancelled, reason: "SOMETHING_ELSE" },
    { ...cancelled, executedUuid: "d1" },
    { ...cancelled, defendantUuid: "p2" },
    { ...cancelled, dayIndex: 3 },
    { ...cancelled, counts: { guilty: -1, notGuilty: 0 } },
  ]) {
    assert.equal(applyTribunalResolvedPure(current, bad), current, JSON.stringify(bad))
  }
})

test("AC-03: 정상 GUILTY/NOT_GUILTY 판정 계약은 그대로 유지된다(취소 분기가 잠식하지 않는다)", () => {
  const current = {
    gameId: "g1",
    state: {
      id: "g1", phase: "TRIBUNAL", dayIndex: 2,
      tribunal: { defendantUuid: "d1", resolved: false },
      players: [{ uuid: "d1", alive: true }, { uuid: "p2", alive: true }],
    },
  }

  const guilty = applyTribunalResolvedPure(current, {
    gameId: "g1", dayIndex: 2, phase: "TRIBUNAL", defendantUuid: "d1",
    outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "d1",
  })
  assert.equal(guilty.state.tribunal.outcome, "GUILTY")
  assert.equal(guilty.state.tribunal.resolved, true)
  assert.equal(guilty.state.players.find((p) => p.uuid === "d1").alive, false)

  const notGuilty = applyTribunalResolvedPure(current, {
    gameId: "g1", dayIndex: 2, phase: "NIGHT", defendantUuid: "d1",
    outcome: "NOT_GUILTY", counts: { guilty: 0, notGuilty: 2 }, executedUuid: null,
  })
  assert.equal(notGuilty.state.phase, "NIGHT")
  assert.equal(notGuilty.state.tribunal, null)
})

function dayVoteState() {
  return gameState({ phase: "DAY", dayPhase: "DAY_VOTE" })
}

function selfProgress({
  seq, hasSubmitted, targetUuid = null, revision = 1, doneCount = 0,
  phase = "DAY", dayIndex = 1, progressKind = "DAY_VOTE",
}) {
  return {
    gameId: "game-1",
    phase,
    dayIndex,
    participationRevision: revision,
    selfProgressSeq: seq,
    progress: { kind: progressKind, doneCount, requiredCount: 2 },
    self: { hasSubmittedDayVote: hasSubmitted, dayVoteTargetUuid: targetUuid, dayVoteRound: 1 },
  }
}

test("AC-03: 이탈 뒤 새로 낸 표가 화면에 반영되고 제출 액션이 다시 열리지 않는다", () => {
  setUp()
  act(() => {
    useInGameStore.getState().setGamePayload({ gameId: "game-1", state: dayVoteState() })
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 1, hasSubmitted: false }))
  })

  const { result } = renderHook(() => useInGameDayVoteSubmit())
  assert.equal(result.current.hasSubmitted, false)

  act(() => {
    useInGameStore.getState().applySelfProgress(
      selfProgress({ seq: 2, hasSubmitted: true, targetUuid: TARGET, doneCount: 1 }),
    )
  })
  assert.equal(result.current.hasSubmitted, true, "낸 표가 화면에서 미제출로 남았다")
  assert.equal(result.current.lastSubmittedTargetId, TARGET)

  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 1, hasSubmitted: false }))
  })
  assert.equal(result.current.hasSubmitted, true, "옛 개인 사건이 제출 상태를 되돌렸다")
  assert.equal(result.current.lastSubmittedTargetId, TARGET)
})

test("AC-03: 옛 단계·옛 날짜의 개인 사건은 완전한 no-op이고, 화면이 아직 모르는 새 단계의 개인 사건은 버려지지 않는다", () => {
  setUp()
  act(() => {
    useInGameStore.getState().setGamePayload({ gameId: "game-1", state: dayVoteState() })
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 1, hasSubmitted: false }))
    useInGameStore.getState().applySelfProgress(
      selfProgress({ seq: 2, hasSubmitted: true, targetUuid: TARGET, doneCount: 1 }),
    )
  })
  const applied = useInGameStore.getState().state
  assert.equal(applied.self.hasSubmittedDayVote, true)
  assert.equal(applied.progress.kind, "DAY_VOTE")

  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({
      seq: 1, hasSubmitted: false, phase: "ROLE_REVEAL", dayIndex: 0, progressKind: "ROLE_REVEAL",
    }))
  })
  assert.deepEqual(useInGameStore.getState().state, applied, "옛 단계의 개인 사건이 상태를 바꿨다")

  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({
      seq: 3, hasSubmitted: false, phase: "NIGHT", dayIndex: 1, progressKind: "NIGHT", doneCount: 1,
    }))
  })
  const next = useInGameStore.getState().state
  assert.equal(next.selfProgressSeq, 3, "새 단계의 개인 사건이 버려졌다")
  assert.equal(next.progress.kind, "NIGHT")
  assert.equal(next.self.hasSubmittedDayVote, false)
  assert.equal(next.phase, "DAY")
})

test("AC-03: 제출보다 먼저 발행된 옛 스냅샷도 낸 표를 되돌리지 못한다", () => {
  setUp()
  act(() => {
    useInGameStore.getState().setGamePayload({ gameId: "game-1", state: dayVoteState() })
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 3, hasSubmitted: false }))
    useInGameStore.getState().applySelfProgress(
      selfProgress({ seq: 4, hasSubmitted: true, targetUuid: TARGET, doneCount: 1 }),
    )
  })
  const { result } = renderHook(() => useInGameDayVoteSubmit())
  assert.equal(result.current.hasSubmitted, true)

  const current = useInGameStore.getState()
  const stale = applySessionSnapshotPure(current, {
    ok: true,
    gameId: "game-1",
    phase: "DAY",
    dayPhase: "DAY_VOTE",
    dayIndex: 1,
    hostUuid: HOST,
    participationRevision: 1,
    selfProgressSeq: 3,
    players: [
      { uuid: HOST, nickname: "호스트", isAlive: true, isConnected: true, isParticipating: true },
      { uuid: TARGET, nickname: "대상", isAlive: true, isConnected: true, isParticipating: true },
    ],
    self: {
      uuid: HOST, nickname: "호스트", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false,
      hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1,
    },
  })
  assert.equal(stale, current, "옛 스냅샷이 방금 낸 표를 되돌렸다")
})

test("AC-01: setGamePayload는 서버 state.hostUuid를 쓰고 전원 생존 단정을 더 이상 하지 않는다", () => {
  act(() => {
    useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: "game-1",
      hostUuid: "옛-방장",
      state: gameState({
        players: [
          { uuid: HOST, nickname: "호스트", isAlive: true, isParticipating: true, membershipId: "mem-host" },
          { uuid: TARGET, nickname: "대상", isAlive: false, isParticipating: true, membershipId: "mem-target" },
        ],
      }),
    })
  })

  const state = useInGameStore.getState()
  assert.equal(state.hostUuid, HOST, "서버 hostUuid가 이깁니다")
  const target = state.state.players.find((p) => p.uuid === TARGET)
  assert.equal(target.alive, false)
  assert.equal(target.isParticipating, true)
})

const CARD_ROSTER = [
  { uuid: HOST, nickname: "호스트", alive: true, isParticipating: true, membershipId: "mem-host", themeIndex: 0 },
  { uuid: TARGET, nickname: "대상", alive: true, isParticipating: true, membershipId: "mem-target", themeIndex: 1 },
]

function setUpCard({ selfUuid = HOST, dayPhase = "DAY_DISCUSSION" } = {}) {
  const socket = createFakeSocket()
  socket.connected = true
  act(() => {
    useAuthStore.setState({ user: { uuid: selfUuid }, isLoggedIn: true })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: "game-1",
      state: gameState({
        dayPhase,
        players: CARD_ROSTER,
        self: {
          uuid: selfUuid,
          nickname: selfUuid === HOST ? "호스트" : "대상",
          role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false,
        },
      }),
    })
  })
  setSocket(socket)
  return socket
}

function mountCardKick() {
  let view
  act(() => {
    view = render(createElement(
      InGamePlayerSessionProvider,
      null,
      createElement(InGameActionProvider, { interactionBlocked: false },
        createElement(InGamePlayerBoard)),
    ))
  })
  return view
}

function openCardMenu(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.ok(card, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  const slot = card.closest('[role="button"]')
  act(() => {
    fireEvent.mouseDown(slot)
    fireEvent.click(slot)
  })
  return container.querySelector(`[${INGAME_PLAYER_CARD_MENU_ATTR}]`)
}

function cardMenuItem(menu, label) {
  if (!menu) return null
  return [...menu.querySelectorAll("button")]
    .find((node) => node.textContent.trim().startsWith(label)) ?? null
}

test("V-2(AC-03): 낮 토론 구간에는 비활성 투표 오버레이만 뜨고 추방 확인 대화는 열리지 않는다", () => {
  setUpCard({ dayPhase: "DAY_DISCUSSION" })
  const view = mountCardKick()

  const menu = openCardMenu(view.container, "대상")
  assert.ok(menu, "토론 구간에서도 카드 오버레이가 열려야 한다")
  const voteButton = cardMenuItem(menu, INGAME_CARD_MENU_DAY_VOTE_LABEL)
  assert.ok(voteButton, "전제: 투표하기가 있어야 한다")
  assert.equal(voteButton.disabled, true, "토론 구간의 투표하기는 비활성이어야 한다")
  assert.equal(byTestId("kick-confirm"), null, "카드에서 추방 확인 대화가 열렸다")
})

test("V-2(AC-03): 낮 투표 구간에는 투표 오버레이만 뜨고 추방 확인 대화는 열리지 않는다", () => {
  const socket = setUpCard({ selfUuid: TARGET, dayPhase: "DAY_VOTE" })
  const view = mountCardKick()

  const menu = openCardMenu(view.container, "호스트")
  assert.ok(menu, "전제: 낮 투표 구간에는 카드 오버레이가 열려야 한다")
  assert.ok(cardMenuItem(menu, INGAME_CARD_MENU_DAY_VOTE_LABEL), "전제: 투표하기가 있어야 한다")
  assert.equal(byTestId("kick-confirm"), null, "카드에서 추방 확인 대화가 열렸다")
  assert.equal(socket.emitted.filter((e) => e.event === "kick_game_player").length, 0)
})

function setUpCardWithFallbackHost({ selfUuid = HOST, dayPhase = "DAY_DISCUSSION" } = {}) {
  const socket = createFakeSocket()
  socket.connected = true
  const { hostUuid: _serverHostUuid, ...stateWithoutHostUuid } = gameState({
    dayPhase,
    players: CARD_ROSTER,
    self: {
      uuid: selfUuid,
      nickname: selfUuid === HOST ? "호스트" : "대상",
      role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false,
    },
  })
  act(() => {
    useAuthStore.setState({ user: { uuid: selfUuid }, isLoggedIn: true })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: "game-1",
      hostUuid: HOST,
      state: stateWithoutHostUuid,
    })
  })
  setSocket(socket)
  return socket
}

test("V-2(AC-03): state.hostUuid가 없는 폴백 세션에서도 설정 경로가 방장을 올바르게 판정한다", () => {
  setUpCardWithFallbackHost({ selfUuid: HOST })

  assert.equal(useInGameStore.getState().state.hostUuid, undefined,
    "전제: 이 세션의 state에는 hostUuid가 없어야 한다")
  assert.equal(useInGameStore.getState().hostUuid, HOST,
    "전제: 폴백 hostUuid가 store 최상위에 저장돼야 한다")

  const settingAsHost = renderHook(() => useInGameSettingIsHost())
  assert.equal(settingAsHost.result.current, true, "설정 경로가 폴백 세션의 방장을 못 알아본다")

  cleanup()
  setUpCardWithFallbackHost({ selfUuid: TARGET, dayPhase: "DAY_VOTE" })
  const settingAsGuest = renderHook(() => useInGameSettingIsHost())
  assert.equal(settingAsGuest.result.current, false, "설정 경로가 비방장에게 방관리를 열어줬다")
})

test("V-2(AC-03): 서버 state.hostUuid가 있으면 폴백 인자보다 그 값이 이긴다", () => {
  act(() => {
    useAuthStore.setState({ user: { uuid: TARGET }, isLoggedIn: true })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: "game-1",
      hostUuid: TARGET,
      state: gameState({
        dayPhase: "DAY_VOTE",
        players: CARD_ROSTER,
        self: { uuid: TARGET, nickname: "대상", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      }),
    })
  })

  assert.equal(useInGameStore.getState().hostUuid, HOST, "서버 state.hostUuid가 폴백에 밀렸다")
  assert.equal(renderHook(() => useInGameSettingIsHost()).result.current, false,
    "설정 경로가 옛 방 단계 복사본으로 방관리를 열어줬다")
})
