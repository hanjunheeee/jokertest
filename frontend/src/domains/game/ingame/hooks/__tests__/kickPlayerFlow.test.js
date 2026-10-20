import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act, createElement } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

/**
 * F-21(AC-02/AC-04/AC-05): 추방 UI·훅·store·전역 수신기를 **실제로 연결해** 검증한다.
 *
 * 대역은 소켓 하나뿐이다(서버 왕복이 없으므로). 확인 취소·전송·실패·결과 재조회·세대 보호는
 * 전부 프로덕션 코드 그대로 돈다.
 *
 * DOM 전역 설치 방식은 기존 훅 테스트(useInGameSettingIsHost.test.js)와 동일하다.
 */
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
// JSDOM은 ResizeObserver를 제공하지 않는다. 실제 모달 안의 Scrollbar(useScrollbarThumb)가
// 마운트 시 이것을 만들므로 관측만 하지 않는 최소 대역을 둔다(추방 계약과 무관한 배선이다).
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 실제 추방 모달은 JSX와 `@/` 별칭을 쓰는 화면 코드다 — Node ESM 기본 리졸버가 풀지 못하므로
// 기존 프론트 훅 시험들과 같은 로더를 등록한다(모듈 목킹이 아니라 경로 해석·JSX 변환뿐이다).
register(new URL("../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// V-2(AC-03): 카드 메뉴 경로는 **실제 플레이어 보드**를 렌더한다. 초상·프레임 픽커는 vite
// alias로 PNG를 끌어오므로 Node에서 그것만 대역한다(바깥 경계이며, 추방 계약과 무관하다).
mock.module("../../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `portrait-${index}`,
    pickInGamePlayerFrame: (index) => `frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc) => frameSrc,
    resolveAccountCardFrameSrc: () => null,
  },
})
// E-3(F-33 AC-03): 보드가 인게임 이모티콘 팔레트 사본을 읽으려고 emojiPalette.store를 import
// 하면서 그 그래프가 HTTP 경계(shared/api/client.js → shared/env.js의 import.meta.env)에 닿는다.
// 추방 계약과 무관한 바깥 경계라 조회가 결정적으로 실패하게 둔다(store가 그 거부를 스스로 잡는다).
mock.module("../../../../user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
    saveEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
  },
})

const { renderHook, render, cleanup, fireEvent } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { applyTribunalResolvedPure } = await import("../../store/applyTribunalResolved.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useKickPlayerRequest, KICK_REQUEST_STATUS } = await import("../useKickPlayerRequest.js")
// V-2(AC-03): 설정 → 방관리 경로의 **실제** 방장 판정. 카드 경로와 같은 답을 내는지 비교한다.
const { useInGameSettingIsHost } = await import("../useInGameSettingIsHost.js")
// AC-03: 이탈·스냅샷 이후의 **실제 제출 표시**를 소유하는 훅이다(대역이 아니라 이것을 띄운다).
const { useInGameDayVoteSubmit } = await import("../useInGameDayVoteSubmit.js")
const { applySessionSnapshotPure } = await import("../../store/applySessionSnapshot.js")
// 진행 중 추방의 **실제 소비 경계**다(주입한 대역이 아니라 이 컴포넌트의 verifyMembership이 돈다).
const { default: SettingKickPlayerModal } = await import(
  "../../components/controls/ingameSetting/kickPlayer/SettingKickPlayerModal.jsx")
// V-2(AC-03): 카드 메뉴 경로의 **실제 생산 트리**. Provider·보드·메뉴·확인 대화를 대역하지
// 않고 그대로 렌더해, 설정 → 방관리 모달과 같은 payload가 나가는지 나란히 비교한다.
const { InGameActionProvider } = await import("../../pages/InGamePage.jsx")
const { InGamePlayerSessionProvider } = await import("../../components/InGamePlayerSessionProvider.jsx")
const { default: InGamePlayerBoard } = await import("../../components/board/InGamePlayerBoard.jsx")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import(
  "../../components/board/InGamePlayerCardMenu.jsx")
const { INGAME_CARD_MENU_DAY_VOTE_LABEL } = await import("../useInGamePlayerCardMenu.js")
const { INGAME_E2E_ATTRS } = await import("../../constants/e2e/ingameE2eHooks.js")

const HOST = "uuid-host"
const TARGET = "uuid-target"

/**
 * emit을 기록하고, ack 콜백을 테스트가 원하는 시점에 직접 부를 수 있는 최소 소켓.
 *
 * id가 **반드시** 있어야 한다 — 실제 소비 경계는 응답이 자기 것인지 판정할 때 소켓 객체와
 * socket.id를 함께 본다(같은 객체의 재연결은 id만 바뀐다). id가 없는 대역을 쓰면 캡처 자체가
 * 불완전해 모든 응답이 fail-closed로 거부되고, 그러면 거부를 단언하는 시험이 **엉뚱한 이유로**
 * 통과한다(실제로 그렇게 통과하고 있었다).
 */
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

/** SettingKickPlayerModal이 실제로 넘기는 것과 같은 buildRequest·scope로 훅을 띄운다. */
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

/** 지금 store roster에서 만든 추방 목록(모달이 넘기는 것과 같은 모양). */
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

// ── AC-04/AC-05: **실제 모달**의 스냅샷 재확인 경계 ───────────────────────────
//
// 아래 시험들은 useKickPlayerRequest에 대역 verifyMembership을 주입하지 않는다 —
// SettingKickPlayerModal을 실제로 렌더해서 그 컴포넌트가 소유한 verifyMembership
// (get_session_snapshot → applySessionSnapshot)이 프로덕션 그대로 돌게 한다. 그 mutation은
// 되돌릴 수 없으므로 모든 판정이 그보다 **앞**에 있어야 한다.

const { INGAME_KICK_PLAYER_MODAL_COPY } = await import(
  "../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js")

/** 실제 모달을 띄운다(portal이므로 document.body에서 찾는다). */
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

/**
 * 실제 모달을 조작해 추방 → ACK 유실 → 결과 조회 → UNKNOWN까지 몰고,
 * 그 UNKNOWN이 시작한 **실제** get_session_snapshot 재확인을 붙잡아 돌려준다.
 */
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

/**
 * 서버 get_session_snapshot 응답 모양. handleGetSessionSnapshot이 보내는 것과 같은 **평면**
 * 구조다 — `respond(callback, { ok: true, ...result.snapshot, players })`. 이 모양이 실제로
 * 적용되는지를 먼저 단언해야(아래 첫 시험) 나머지 거부 시험이 "모양이 틀려서"가 아니라
 * "경계가 막아서" 통과한다는 것이 증명된다.
 */
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

  // 적용 경계(applySessionSnapshotPure)가 참조 보존 no-op으로 거부하는 응답이다 — roster가
  // 현재 판과 다르다. 이전 구현은 이런 no-op도 "재확인 성공"으로 읽어 낡은 목록 위에서 새
  // 확인을 열어 주었다.
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

  // 객체는 그대로, id만 새로 — 객체 동일성 비교만으로는 이 경우가 통과한다.
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

  // 계정·소켓·판·내 소속이 전부 그대로다. 참여 세대만 더 새로워졌다.
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

  // 그보다 먼저 만들어진(대상이 아직 참여 중인) 스냅샷이 이제 도착한다.
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

// ── AC-02: 확인 절차 ─────────────────────────────────────────────────────────

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
  // 신원·방·소속은 전부 서버가 준 값이다. 화면이 만들어 낸 값은 requestId뿐이다.
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
  // 전송 중 다시 확인·승인을 시도한다.
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  assert.equal(socket.emitted.length, 1)
})

// ── AC-04: 확인 무효화와 결과 재조회 ──────────────────────────────────────────

test("AC-04: 확인 도중 대상이 나갔다 다시 들어오면(새 소속) 승인은 요청 0회로 거부된다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))

  // 같은 uuid가 **다른 소속**으로 다시 앉았다.
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
  // ACK가 오지 않는다 — 여전히 SENDING이고 성공이 아니다.
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)
  assert.equal(result.current.canLookupResult, true)

  act(() => result.current.lookupResult())
  const lookup = socket.emitted[1]
  assert.equal(lookup.event, "get_kick_result")
  // 새 추방을 다시 보내지 않는다 — 기존 키만 묻는다.
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

// ── AC-05: 세대 보호 ─────────────────────────────────────────────────────────

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

  setSocket(createFakeSocket()) // 재연결로 canonical 소켓이 바뀌었다
  act(() => pending.ack({ ok: true, status: "KICKED" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING)
})

test("AC-05: 뒤에 시작된 조회가 있으면 앞선 조회의 늦은 ACK는 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  // 1) 첫 추방의 ACK를 놓쳤다.
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  // 2) 결과를 조회했는데 그 응답도 오지 않아 한 번 더 조회한다.
  act(() => result.current.lookupResult())
  const staleLookup = socket.emitted[1]
  act(() => result.current.lookupResult())
  const currentLookup = socket.emitted[2]
  assert.equal(socket.emitted.length, 3)

  // 3) 이제서야 **앞선** 조회가 답한다 — 이미 더 나중 조회가 진행 중이므로 지난 답이다.
  act(() => staleLookup.ack({ ok: true, status: "KICKED", replayed: true }))
  assert.equal(
    result.current.status, KICK_REQUEST_STATUS.SENDING,
    "앞선 조회의 결과가 진행 중인 화면을 성공으로 덮었다",
  )

  // 4) 지금 조회의 답만 반영된다.
  act(() => currentLookup.ack({ ok: false, code: "STALE_SOCKET" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "STALE_SOCKET")
})

test("AC-02/AC-04: 결과를 모르는 전송이 남아 있으면 안내를 닫았다 열어도 두 번째 추방이 나가지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  // ACK를 놓친 전송 하나.
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1)

  // 모달을 닫으면 안내는 정리되지만(IDLE) 그 전송의 결과를 알게 된 것은 아니다.
  act(() => result.current.reset())
  assert.equal(result.current.status, KICK_REQUEST_STATUS.IDLE)

  // 다시 열어 같은 대상을 지목해도 확인 자체가 열리지 않고 요청도 나가지 않는다.
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1, "닫기·열기만으로 미확인 전송이 우회됐다")

  // 결과를 실제로 알게 되면 그때 비로소 잠금이 풀린다. **기록된 거부의 재생**은 서버가
  // replayed:true로 표시한다 — 그 표시가 "이 요청은 실행되지 않았다"는 역사적 사실이다
  // (표시 없는 ok:false는 조회 자체의 실패이고, 원 요청에 대해서는 아무 것도 말하지 않는다 —
  // 아래 별도 시험이 그 구분을 고정한다).
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

  // 결과 조회가 **전송·인증 사유로** 실패했다. 원 추방이 실행됐는지는 여전히 모른다.
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: false, code: "STALE_SOCKET" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.FAILED)
  assert.equal(result.current.errorCode, "STALE_SOCKET")

  // 그러므로 새 requestId의 두 번째 추방이 열리지 않는다(잠금은 결과를 알게 될 때만 풀린다).
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 2, "조회 실패 뒤에 새 추방이 나갔다")

  // 회복 경로는 남아 있다 — **같은 영수증**으로 다시 물으면 된다.
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

  // Socket.IO의 재연결은 **객체를 유지하고 id만 새로 받는다** — 객체 비교만으로는 못 잡는다.
  socket.id = "sock-ingame-reconnected"
  act(() => socket.emitted[0].ack({ ok: true }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SENDING, "옛 연결의 ACK가 성공으로 반영됐다")
  // 결과를 여전히 모르므로 잠금도 그대로다 — 두 번째 추방이 나가지 않는다.
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  assert.equal(socket.emitted.length, 1, "옛 연결의 ACK가 전송 잠금을 풀었다")
})

test("AC-05: A→B→A 계정 전환이 한 번에 처리돼도 그 사이의 ACK는 현재 화면을 바꾸지 않는다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))

  // 같은 act 안에서 로그아웃→재로그인이 끝난다. uuid는 제자리로 돌아오므로 값 비교로는
  // 잡히지 않고, 훅의 계정 세대 effect도 authUuid가 바뀌어 보이지 않아 오르지 않는다.
  // 전이 횟수(identityGeneration)만이 그 사이에 다른 계정이 있었다는 사실을 남긴다.
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

  // 요청 A — ACK 유실 → 조회 → UNKNOWN → 재확인 시작(A의 요청 세대).
  act(() => result.current.requestConfirm(currentTargets()[0]))
  act(() => result.current.confirmKick(currentTargets()))
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(result.current.isAwaitingResolution, true)

  // 재확인 A가 도는 사이에 조회를 한 번 더 보낸다(= 더 새로운 요청 세대 B).
  act(() => result.current.lookupResult())
  assert.equal(socket.emitted.length, 3)

  // 이제 A의 재확인이 끝난다 — 이것은 B의 결과가 아니므로 잠금을 풀 근거가 아니다.
  return act(async () => { release(true) }).then(() => {
    assert.equal(result.current.isAwaitingResolution, true, "옛 재확인이 더 새로운 요청의 잠금을 풀었다")
  })
})

test("AC-02: 같은 렌더 안에서 confirmKick을 두 번 불러도 요청은 한 번뿐이다", () => {
  const socket = setUp()
  const { result } = mountKick()

  act(() => result.current.requestConfirm(currentTargets()[0]))
  // 한 act(=한 번의 렌더 커밋) 안에서 두 번 부른다. 예전에는 두 호출 모두 렌더 시점의
  // statusRef(IDLE/CONFIRMING)를 읽어 **서로 다른 requestId로 둘 다** 나갔다.
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
  // ACK를 놓친 상태 — 확인 대상이 아직 남아 있다.
  assert.equal(result.current.pendingTarget?.uuid, TARGET)

  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.UNKNOWN)
  assert.equal(result.current.pendingTarget, null, "UNKNOWN 뒤에는 지금 목록에서 다시 확인해야 한다")

  // 확인이 없으므로 승인은 요청을 만들지 않는다(자동 재전송도 없다).
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

  // 재확인이 끝나기 전에는 새 확인 자체가 열리지 않는다(자동 재전송도 없다).
  act(() => result.current.requestConfirm(currentTargets()[0]))
  assert.equal(result.current.pendingTarget, null)
  assert.equal(socket.emitted.length, 2)

  // 재확인이 **성공**해야 비로소 다시 지목할 수 있다.
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

/**
 * F-21(AC-04): 재확인 요구는 "결과를 모른다"에서만 생기므로, 그 영수증의 결과가 **확정으로**
 * 돌아오면 요구도 함께 내려가야 한다. 예전에는 두 번째 조회가 잠금만 풀고 요구는 남겼고,
 * 먼저 시작된 재확인은 (옳게) 세대 불일치로 폐기되므로 아무도 요구를 내리지 못해 새 확인이
 * 영영 열리지 않았다.
 */
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

  // ACK 유실 → 조회① UNKNOWN → 재확인이 실제로 시작되고 새 확인이 잠긴다.
  act(() => result.current.lookupResult())
  act(() => socket.emitted[1].ack({ ok: true, status: "UNKNOWN" }))
  assert.equal(result.current.isAwaitingResolution, true)
  assert.ok(release, "UNKNOWN인데 서버 재확인이 시작되지 않았다")

  // 조회② — 서버가 **그 영수증의 결과**를 확정해서 답한다.
  act(() => result.current.lookupResult())
  act(() => socket.emitted[2].ack({ ok: true, status: "KICKED", replayed: true }))

  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
  assert.equal(result.current.isAwaitingResolution, false, "결과를 알게 됐는데 재확인 요구가 남았다")

  // 뒤늦게 끝난 재확인①은 더 새로운 세대의 상태를 건드리지 않는다(자동 재전송도 없다).
  await act(async () => { release(true) })
  assert.equal(result.current.status, KICK_REQUEST_STATUS.SUCCEEDED)
  assert.equal(result.current.isAwaitingResolution, false)
  assert.equal(socket.emitted.length, 3, "옛 재확인의 완료가 새 요청을 만들었다")

  // 이제 **현재 목록의 다른 유효한 대상**을 새 확인 절차로 추방할 수 있다.
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

  // "그 요청은 실행되지 않았다"는 역사적 사실도 결과를 알게 된 것이다.
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

  // 조회 자체의 실패는 원 요청의 결과에 대해 아무 것도 말하지 않는다 — 요구를 내릴 근거가 아니다.
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
  // 재조회 키는 그대로 남는다 — 서버 기록은 안내를 닫았다고 사라지지 않는다.
  assert.equal(result.current.canLookupResult, true)
})

// ── AC-03: 참여 상태와 재판 취소의 실제 store 반영 ────────────────────────────

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
  // 생존은 이 사건의 사실이 아니다 — player_eliminated가 따로 전달한다.
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
  apply(1, true) // 늦게 도착한 옛 사건

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
  // 취소는 처형이 아니다 — 생존은 이 사건으로 바뀌지 않는다.
  assert.equal(next.state.players.find((p) => p.uuid === "d1").alive, true)

  // 조합이 하나라도 어긋나면 완전한 no-op이다(취소가 판정처럼 다뤄지지 않게).
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

// ── AC-01: 서버 hostUuid가 방관리 권한의 유일한 원천이다 ──────────────────────

// ── AC-03: 이탈 이후의 **본인 제출 표시** ────────────────────────────────────
//
// 화면은 서버가 실어 준 본인 값을 canonical로 쓴다(늦은 ACK가 정규화를 되돌리지 못하게 하려고).
// 그래서 이탈 뒤의 평범한 제출이 서버 값을 갱신하지 않으면 그 두 계약이 서로를 무력화한다 —
// 표는 커밋됐는데 화면은 "아직 안 냄"이고 제출 액션이 다시 열린다.

/** DAY_VOTE 구간의 게임 상태(본인 제출 표시를 보려는 것이 목적이다). */
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
    // 추방이 일어난 순간의 개인 전송 — 이 사람은 아직 내지 않았다.
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 1, hasSubmitted: false }))
  })

  const { result } = renderHook(() => useInGameDayVoteSubmit())
  assert.equal(result.current.hasSubmitted, false)

  // 그 뒤 평범하게 한 표를 낸다 — 서버가 본인 값을 다시 말해 준다(더 새로운 순서값).
  act(() => {
    useInGameStore.getState().applySelfProgress(
      selfProgress({ seq: 2, hasSubmitted: true, targetUuid: TARGET, doneCount: 1 }),
    )
  })
  assert.equal(result.current.hasSubmitted, true, "낸 표가 화면에서 미제출로 남았다")
  assert.equal(result.current.lastSubmittedTargetId, TARGET)

  // 그 뒤에 도착한 **옛** 개인 사건(같은 참여 세대, 더 낮은 순서값)은 되돌리지 못한다.
  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({ seq: 1, hasSubmitted: false }))
  })
  assert.equal(result.current.hasSubmitted, true, "옛 개인 사건이 제출 상태를 되돌렸다")
  assert.equal(result.current.lastSubmittedTargetId, TARGET)
})

/**
 * F-21(AC-03): **옛 단계·옛 날짜의 개인 사건**이 새 단계의 값을 덮지 못하는지를 본다.
 *
 * 방어는 단계 비교가 아니라 **단조 증가하는 순서값**이 한다. 서버는 개인 전송마다 값을 올리고
 * 같은 연결의 전달 순서는 보존되므로, 더 옛 사건은 언제나 더 작은 순서값을 갖는다. 반대로
 * "내가 아는 phase와 같을 때만 적용한다"로 막으면 **정당한 갱신이 버려진다** — 피고 이탈의
 * 개인 전송은 화면이 아직 모르는 새 단계(NIGHT)를 싣고 취소 사건보다 먼저 도착한다
 * (backend/socket/__tests__/kickPlayers.test.js의 같은 계약 시험과 짝이다).
 */
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

  // 늦게 도착한 **옛 날짜·옛 단계**의 개인 사건 — 순서값이 더 작으므로 아무 것도 바꾸지 않는다.
  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({
      seq: 1, hasSubmitted: false, phase: "ROLE_REVEAL", dayIndex: 0, progressKind: "ROLE_REVEAL",
    }))
  })
  assert.deepEqual(useInGameStore.getState().state, applied, "옛 단계의 개인 사건이 상태를 바꿨다")

  // 반대로 **더 새로운 단계**를 실은 개인 사건은 화면이 그 단계를 아직 모르더라도 적용된다.
  act(() => {
    useInGameStore.getState().applySelfProgress(selfProgress({
      seq: 3, hasSubmitted: false, phase: "NIGHT", dayIndex: 1, progressKind: "NIGHT", doneCount: 1,
    }))
  })
  const next = useInGameStore.getState().state
  assert.equal(next.selfProgressSeq, 3, "새 단계의 개인 사건이 버려졌다")
  assert.equal(next.progress.kind, "NIGHT")
  assert.equal(next.self.hasSubmittedDayVote, false)
  // 단계 자체는 개인 사건이 옮기지 않는다(그 일은 단계 사건의 몫이다).
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

  // 스냅샷 조회는 제출보다 먼저 발행됐다 — 참여 세대는 같으므로 그 검사로는 걸러지지 않는다.
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
      // 호출부가 넘긴 옛 방 단계 복사본은 서버 값에 밀린다.
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
  // 사망했지만 아직 참여 중 — 이 둘이 합쳐지면 사망자 추방이 구조적으로 불가능해진다.
  const target = state.state.players.find((p) => p.uuid === TARGET)
  assert.equal(target.alive, false)
  assert.equal(target.isParticipating, true)
})

// ═══════════════════════════════════════════════════════════════════════════
// V-2(AC-03): 플레이어 카드 행동 오버레이 — 추방은 설정 → 방관리만
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 카드 보드는 themeIndex가 있는 roster만 실제 명단으로 인정한다
 * (buildPlayerSessionSourceFromGameState) — 없으면 10칸 미리보기로 떨어져 본인 판정 자체가
 * 성립하지 않는다. 그래서 카드 경로 시험만 이 명단을 쓴다.
 */
const CARD_ROSTER = [
  { uuid: HOST, nickname: "호스트", alive: true, isParticipating: true, membershipId: "mem-host", themeIndex: 0 },
  { uuid: TARGET, nickname: "대상", alive: true, isParticipating: true, membershipId: "mem-target", themeIndex: 1 },
]

/** 카드 경로용 seed. 기본은 방장 본인·낮 토론(=비활성 투표 오버레이만 뜨는 구간)이다. */
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

/** 실제 생산 트리. Provider·보드·메뉴·확인 대화 어느 것도 대역하지 않는다. */
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

/** 잠긴 항목은 라벨 뒤에 사유 문구를 함께 그린다 — 정확 일치로 찾으면 그것만 못 찾는다. */
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

// ── 방장 판정 — 설정 → 방관리 경로 ─────────────────────────────────────────
//
// 카드 오버레이에는 추방이 없으므로, 방장 판정은 설정 경로만 본다.

/** state.hostUuid **없이** 최상위 폴백 hostUuid로만 세워진 세션. */
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
      hostUuid: HOST, // 구버전 payload 폴백 — state 안에는 없다
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
