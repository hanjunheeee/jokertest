import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
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
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { applyTribunalResolvedPure } = await import("../../store/applyTribunalResolved.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useKickPlayerRequest, KICK_REQUEST_STATUS } = await import("../useKickPlayerRequest.js")

const HOST = "uuid-host"
const TARGET = "uuid-target"

/** emit을 기록하고, ack 콜백을 테스트가 원하는 시점에 직접 부를 수 있는 최소 소켓. */
function createFakeSocket() {
  const emitted = []
  return {
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
function mountKick() {
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
  act(() => {
    useInGameStore.getState().clearGame()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
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
