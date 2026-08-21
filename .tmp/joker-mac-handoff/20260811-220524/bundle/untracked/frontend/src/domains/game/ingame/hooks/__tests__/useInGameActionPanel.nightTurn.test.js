import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

/**
 * 이 저장소의 node:test 실행(package.json의 "test" 스크립트)에는 JSX 로더가 없다 — .jsx 파일은
 * 이 프로세스에서 직접 import할 수 없다(InGameActionPanel.productionSource.test.js가 실제
 * import 대신 raw source 문자열 매칭을 쓰는 이유와 동일). 그래서 이 파일은 InGameActionPanel.jsx를
 * 렌더링하지 않고, 그 버튼의 onClick이 실제로 호출하는 production 훅(useInGameActionPanel)을
 * React.createElement로 직접 mount해 submitNightAction/skipNightAction 클로저를 얻고 그것을
 * 직접 호출한다 — useInGameTribunalVoteSubmit.test.js/useInGameActionPanel.test.js와 동일한
 * 관례다. onClick={submitNightAction} 배선 자체는 productionSource 테스트가 독립적으로
 * 증명하므로, 두 테스트를 합치면 "실제 클릭 → submit_night_action" 전체 계약이 증명된다.
 */

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

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

let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of fakeSocketSubscribers) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: { getSocket: fakeGetSocket, subscribeSocket: fakeSubscribeSocket },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { InGamePlayerSessionContext } = await import("../../components/InGamePlayerSessionContext.js")
const { useInGameActionPanel } = await import("../useInGameActionPanel.js")

/** emitWithAck 호출마다 독립적인 pending ack를 큐에 쌓는 fake socket. resolveNext/rejectNext로
 * 원하는 호출 순서의 ack를 개별적으로 확정할 수 있다(재제출 시나리오에서 각 시도를 구분하기
 * 위함). useInGameNightActionSubmit.submit()이 실제로 쓰는 .timeout(ms).emitWithAck(...) 체인을
 * 그대로 흉내낸다. */
function createFakeConnectedSocket() {
  const emits = []
  const pending = []
  const socket = {
    connected: true,
    on() {},
    off() {},
    timeout() {
      return {
        emitWithAck(event, payload) {
          emits.push({ event, payload })
          let resolve
          let reject
          const promise = new Promise((res, rej) => {
            resolve = res
            reject = rej
          })
          pending.push({ resolve, reject })
          return promise
        },
      }
    },
  }
  return {
    socket,
    emits,
    resolveNext(value) {
      pending.shift()?.resolve(value)
    },
    rejectNext(err) {
      pending.shift()?.reject(err)
    },
    pendingCount: () => pending.length,
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function seedNightState({ myRole = "JOKER", nightTurnRole = "JOKER", dayIndex = 1 } = {}) {
  useInGameStore.setState({
    gameId: "g1",
    state: {
      id: "g1",
      phase: "NIGHT",
      dayIndex,
      nightTurnRole,
      players: [
        { uuid: "p1", nickname: "P1" },
        { uuid: "p2", nickname: "P2" },
      ],
      self: { uuid: "p1", nickname: "P1", role: myRole },
      events: [],
    },
    error: null,
  })
}

function sessionContextValue({ localStatus = "alive" } = {}) {
  return {
    players: [
      { id: "p1", nickname: "P1", status: localStatus },
      { id: "p2", nickname: "P2", status: "alive" },
    ],
    localPlayerId: "p1",
  }
}

function mountActionPanel(contextValue = sessionContextValue()) {
  function Wrapper({ children }) {
    return React.createElement(InGamePlayerSessionContext.Provider, { value: contextValue }, children)
  }
  return renderHook(() => useInGameActionPanel(), { wrapper: Wrapper })
}

// ---------------------------------------------------------------------------
// 실제 훅 mount → 대상 선택 후 submitNightAction 호출 → submit_night_action 정확히 1회
// ---------------------------------------------------------------------------

test("실제 훅: 대상을 고르고 submitNightAction(암살 확정의 onClick)을 호출하면 submit_night_action이 정확히 한 번, 선택한 target과 함께 emit된다", async () => {
  seedNightState()
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })

  assert.equal(fake.emits.length, 1)
  assert.deepEqual(fake.emits[0], { event: "submit_night_action", payload: { gameId: "g1", targetId: "p2" } })
  assert.equal(fake.emits.some((e) => e.event === "resolve_night"), false, "resolve_night는 어떤 경로로도 emit되면 안 된다")

  await act(async () => {
    fake.resolveNext({ ok: true })
    await flushMicrotasks()
  })

  hook.unmount()
})

// ---------------------------------------------------------------------------
// 제출 중/제출 완료 상태
// ---------------------------------------------------------------------------

test("실제 훅: 제출 즉시 nightActionStatus가 'submitting'이고, 성공 ack 이후 'submitted'로 잠긴다(제출 완료 · 다음 역할을 기다리는 중에 대응)", async () => {
  seedNightState()
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(hook.result.current.nightActionStatus, "submitting")

  await act(async () => {
    fake.resolveNext({ ok: true })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.nightActionStatus, "submitted")
  assert.equal(hook.result.current.nightActionError, null)

  hook.unmount()
})

// ---------------------------------------------------------------------------
// 대기 중 중복 호출은 no-op
// ---------------------------------------------------------------------------

test("실제 훅: 제출이 아직 진행 중이거나 이미 성공(submitted)한 뒤에는 다시 호출해도 새 emit이 생기지 않는다", async () => {
  seedNightState()
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(fake.emits.length, 1)

  // 아직 ack가 오지 않은 동안 중복 호출.
  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(fake.emits.length, 1, "제출 진행 중 중복 호출은 emit을 만들면 안 된다")

  await act(async () => {
    fake.resolveNext({ ok: true })
    await flushMicrotasks()
  })
  assert.equal(hook.result.current.nightActionStatus, "submitted")

  // 같은 턴에서 성공 이후 다시 호출해도(예: 잠금이 실패해 버튼이 눌린 경우) emit이 없어야 한다.
  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(fake.emits.length, 1, "같은 턴에서 이미 성공한 뒤의 재호출은 emit을 만들면 안 된다")

  hook.unmount()
})

// ---------------------------------------------------------------------------
// canonical 역할 턴 전환 시 이전 상태 초기화
// ---------------------------------------------------------------------------

test("실제 훅: canonical NIGHT 턴이 다음 역할로 넘어가면 nightActionStatus가 idle로 되돌아가고(더 이상 이 배우의 턴이 아니므로 컨트롤도 잠긴다)", async () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "JOKER" })
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })
  await act(async () => {
    fake.resolveNext({ ok: true })
    await flushMicrotasks()
  })
  assert.equal(hook.result.current.nightActionStatus, "submitted")
  // nightActionControlsEnabled 자체는 여전히 true다(역할·생존·연결은 그대로다) — "이미 제출함"은
  // 별도로 nightActionStatus !== 'idle'이 잠근다(dayVoteControlsEnabled/dayVoteStatus와 동일한
  // 기존 관례).
  assert.equal(hook.result.current.nightActionControlsEnabled, true)

  // 서버가 방송한 canonical 턴 전환(night_turn_changed → store)을 그대로 흉내낸다.
  await act(async () => {
    useInGameStore.setState((current) => ({
      gameId: current.gameId,
      state: { ...current.state, nightTurnRole: "DOCTOR" },
      error: current.error,
    }))
  })

  assert.equal(hook.result.current.nightActionStatus, "idle")
  // JOKER는 더 이상 canonical 현재 턴이 아니므로(DOCTOR로 넘어감) 컨트롤은 계속 비활성이다.
  assert.equal(hook.result.current.nightActionControlsEnabled, false)

  hook.unmount()
})

// ---------------------------------------------------------------------------
// wrong-role/dead/disconnected 비활성화
// ---------------------------------------------------------------------------

test("실제 훅: 자기 턴이 아니면(wrong-role) nightActionControlsEnabled가 false다", () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "DOCTOR" })
  setFakeSocket(createFakeConnectedSocket().socket)

  const hook = mountActionPanel()

  assert.equal(hook.result.current.nightActionControlsEnabled, false)
  hook.unmount()
})

test("실제 훅: 로컬 참가자가 사망 상태면 nightActionControlsEnabled가 false다", () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "JOKER" })
  setFakeSocket(createFakeConnectedSocket().socket)

  const hook = mountActionPanel(sessionContextValue({ localStatus: "dead" }))

  assert.equal(hook.result.current.nightActionControlsEnabled, false)
  hook.unmount()
})

test("실제 훅: 소켓이 연결돼 있지 않으면 nightActionControlsEnabled가 false다", () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "JOKER" })
  const fake = createFakeConnectedSocket()
  fake.socket.connected = false
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  assert.equal(hook.result.current.nightActionControlsEnabled, false)
  hook.unmount()
})

test("실제 훅: 정상 조건(연결·생존·자기 턴)이면 nightActionControlsEnabled가 true다(positive control)", () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "JOKER" })
  setFakeSocket(createFakeConnectedSocket().socket)

  const hook = mountActionPanel()

  assert.equal(hook.result.current.nightActionControlsEnabled, true)
  hook.unmount()
})

// ---------------------------------------------------------------------------
// 실패/타임아웃은 재시도 가능하다
// ---------------------------------------------------------------------------

test("실제 훅: 서버 거부(ok:false) 이후 idle로 돌아가 다시 제출할 수 있다", async () => {
  seedNightState()
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })

  await act(async () => {
    fake.resolveNext({ ok: false, message: "이미 판정되었습니다." })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.nightActionStatus, "idle")
  assert.equal(hook.result.current.nightActionError, "이미 판정되었습니다.")

  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(fake.emits.length, 2, "실패 이후 재호출은 새 제출을 다시 보내야 한다")

  hook.unmount()
})

test("실제 훅: 요청이 타임아웃(reject)돼도 idle로 돌아가 재시도할 수 있다", async () => {
  seedNightState()
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })

  await act(async () => {
    fake.rejectNext(new Error("timeout"))
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.nightActionStatus, "idle")
  assert.equal(hook.result.current.nightActionError, "요청이 응답하지 않습니다. 다시 시도해주세요.")

  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(fake.emits.length, 2)

  hook.unmount()
})

// ---------------------------------------------------------------------------
// stale ACK는 새 턴을 덮어쓰지 않는다
// ---------------------------------------------------------------------------

test("실제 훅: 제출 진행 중 canonical 턴이 이미 넘어간 뒤 늦게 도착한 성공 ack는 hook 상태에 반영되지 않는다", async () => {
  seedNightState({ myRole: "JOKER", nightTurnRole: "JOKER" })
  const fake = createFakeConnectedSocket()
  setFakeSocket(fake.socket)

  const hook = mountActionPanel()

  act(() => {
    hook.result.current.setSelectedNightTargetId("p2")
  })
  act(() => {
    hook.result.current.submitNightAction()
  })
  assert.equal(hook.result.current.nightActionStatus, "submitting")
  assert.equal(fake.pendingCount(), 1)

  // ack가 아직 오지 않은 상태에서 canonical 턴이 이미 다음 역할로 넘어간다(다른 배우가 없어
  // 곧바로 전이됐다고 가정) — invalidate가 실행돼 상태가 다시 idle이 된다.
  await act(async () => {
    useInGameStore.setState((current) => ({
      gameId: current.gameId,
      state: { ...current.state, nightTurnRole: "DOCTOR" },
      error: current.error,
    }))
  })
  assert.equal(hook.result.current.nightActionStatus, "idle")

  // 이제 늦게 도착한 성공 ack가 stale로 무시되어야 한다.
  await act(async () => {
    fake.resolveNext({ ok: true })
    await flushMicrotasks()
  })

  assert.equal(hook.result.current.nightActionStatus, "idle", "stale ACK가 'submitted'로 뒤엎으면 안 된다")

  hook.unmount()
})
