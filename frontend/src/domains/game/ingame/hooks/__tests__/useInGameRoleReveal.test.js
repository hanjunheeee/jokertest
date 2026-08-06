import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal(
  "requestAnimationFrame",
  dom.window.requestAnimationFrame.bind(dom.window),
)
installDomGlobal(
  "cancelAnimationFrame",
  dom.window.cancelAnimationFrame.bind(dom.window),
)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")

// useInGameRoleReveal이 (내부의 useInGameRoleRevealAck를 통해) module 최상단에서 import하는
// socketClient(getSocket/subscribeSocket)를 실제 mount 테스트에서 제어 가능한 fake로 교체한다.
// 이 훅의 열림 상태는 socket과 무관하므로, socket이 아예 없는(getSocket → null) 상태를
// 그대로 둔다 — acknowledge_role_reveal 자동 발사는 소켓이 없으면 조용히 아무 것도 하지
// 않고 물러난다(useInGameRoleRevealAck.js 참고).
mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => null,
    subscribeSocket: () => () => {},
  },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameRoleReveal } = await import("../useInGameRoleReveal.js")

function seedStore({ gameId, playerUuid = "player-1", nickname = "Alice", role = "CITIZEN", phase = "NIGHT", dayIndex = 0, allies }) {
  const team = role === "JOKER" ? "JOKER" : "CITIZEN"
  useInGameStore.setState({
    gameId,
    state: gameId
      ? {
          id: gameId,
          phase,
          dayIndex,
          players: [{ uuid: playerUuid, nickname, alive: true, isConnected: true }],
          self: {
            uuid: playerUuid,
            nickname,
            role,
            team,
            hasActedThisPhase: false,
            ...(role === "JOKER" ? { allies: allies ?? [] } : {}),
          },
          tribunal: null,
          winResult: null,
          nightResult: null,
          dayVoteResolution: null,
        }
      : null,
    error: null,
  })
}

function seedAuth(uuid) {
  useAuthStore.setState({ user: uuid ? { uuid } : null, isLoggedIn: Boolean(uuid), loggedOutIntentionally: false })
}

test("역할 데이터가 없으면(state 없음) 자동으로 열리지 않고 roleInfo도 null이다", () => {
  seedStore({ gameId: null })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())

  assert.equal(hook.result.current.open, false)
  assert.equal(hook.result.current.roleInfo, null)

  hook.unmount()
})

test("유효한 현재 self role이면 정확히 한 번 자동으로 열린다(재렌더로 다시 열리지 않음)", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())

  assert.equal(hook.result.current.open, true)
  assert.ok(hook.result.current.roleInfo)
  assert.equal(hook.result.current.roleInfo.role, "CITIZEN")

  hook.rerender()
  hook.rerender()
  assert.equal(hook.result.current.open, true, "이미 연 identity는 재렌더로 상태가 흔들리지 않는다")

  hook.unmount()
})

test("닫으면 socket emit도 canonical store 변경도 없이 로컬 상태만 닫힌다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  assert.equal(hook.result.current.open, true)

  const storeStateBefore = useInGameStore.getState()

  act(() => {
    hook.result.current.close()
  })

  assert.equal(hook.result.current.open, false)
  assert.equal(useInGameStore.getState(), storeStateBefore, "close()는 canonical store 참조를 전혀 바꾸지 않아야 한다")
  assert.equal(useInGameStore.getState().gameId, "g1")

  hook.unmount()
})

test("같은 identity에서의 phase·roster·connectivity 갱신은 닫힌 오버레이를 다시 열지 않는다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN", phase: "ROLE_REVEAL" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  assert.equal(hook.result.current.open, true)

  act(() => {
    hook.result.current.close()
  })
  assert.equal(hook.result.current.open, false)

  // phase 전이 (self 참조는 그대로 유지된 채 다른 필드만 바뀜 — applyPhaseChanged와 동일한 형태)
  act(() => {
    useInGameStore.setState((current) => ({ state: { ...current.state, phase: "NIGHT" } }))
  })
  assert.equal(hook.result.current.open, false, "phase 갱신은 재오픈을 트리거하면 안 된다")

  // roster(connectivity) 갱신
  act(() => {
    useInGameStore.setState((current) => ({
      state: {
        ...current.state,
        players: current.state.players.map((p) => ({ ...p, isConnected: false })),
      },
    }))
  })
  assert.equal(hook.result.current.open, false, "roster/connectivity 갱신은 재오픈을 트리거하면 안 된다")

  hook.unmount()
})

test("같은 identity에서의 반복된 스냅샷 적용(self가 새 객체로 교체돼도)은 닫힌 오버레이를 다시 열지 않는다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  act(() => {
    hook.result.current.close()
  })
  assert.equal(hook.result.current.open, false)

  // get_session_snapshot 재적용 — 내용은 동일하지만 self가 매번 새 객체로 만들어진다.
  act(() => {
    useInGameStore.setState((current) => ({
      state: {
        ...current.state,
        self: { ...current.state.self },
      },
    }))
  })
  assert.equal(hook.result.current.open, false, "동일 identity의 반복 스냅샷은 재오픈을 트리거하면 안 된다")

  act(() => {
    useInGameStore.setState((current) => ({
      state: {
        ...current.state,
        self: { ...current.state.self },
      },
    }))
  })
  assert.equal(hook.result.current.open, false)

  hook.unmount()
})

test("'내 역할 보기'에 해당하는 reopen()은 몇 번이든 다시 연다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  act(() => hook.result.current.close())
  assert.equal(hook.result.current.open, false)

  act(() => hook.result.current.reopen())
  assert.equal(hook.result.current.open, true)

  act(() => hook.result.current.close())
  assert.equal(hook.result.current.open, false)

  act(() => hook.result.current.reopen())
  assert.equal(hook.result.current.open, true)

  hook.unmount()
})

test("다른 gameId로 바뀌면 새 reveal identity로 취급해 닫혀 있어도 자동으로 다시 연다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  act(() => hook.result.current.close())
  assert.equal(hook.result.current.open, false)

  act(() => {
    // 같은 인증 계정(player-1)이 새 게임(g2)에 들어간 상황을 재현한다.
    seedStore({ gameId: "g2", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  })

  assert.equal(hook.result.current.open, true, "새 gameId는 새 reveal identity라 자동으로 다시 열려야 한다")
  assert.equal(hook.result.current.roleInfo.uuid, "player-1")

  hook.unmount()
})

test("같은 gameId라도 인증 계정 uuid가 바뀌면 새 reveal identity로 취급해 자동으로 다시 연다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", role: "CITIZEN" })
  seedAuth("player-1")

  const hook = renderHook(() => useInGameRoleReveal())
  act(() => hook.result.current.close())
  assert.equal(hook.result.current.open, false)

  act(() => {
    seedStore({ gameId: "g1", playerUuid: "player-2", nickname: "Carol", role: "CITIZEN" })
    seedAuth("player-2")
  })

  assert.equal(hook.result.current.open, true, "새 인증 uuid는 새 reveal identity라 자동으로 다시 열려야 한다")

  hook.unmount()
})

test("이전 계정/게임의 stale self(uuid 불일치)는 자동으로 열리지 않는다", () => {
  seedStore({ gameId: "g1", playerUuid: "stale-uuid", nickname: "Ghost", role: "CITIZEN" })
  seedAuth("player-1") // 인증된 계정과 store의 self.uuid가 다르다

  const hook = renderHook(() => useInGameRoleReveal())

  assert.equal(hook.result.current.open, false)
  assert.equal(hook.result.current.roleInfo, null)

  hook.unmount()
})
