// FE-002: 재판 중 피고가 나감 → 서버 순서(사망 NIGHT 방송 → 참여 변경 → 재판 취소)대로 받아도
// 피고가 죽은 것으로 남고 다음 밤 결과가 받아져 판이 밤에서 멈추지 않음
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"
import { register } from "node:module"

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

// 원본의 "@/" 별칭 경로를 풀어 주는 불러오기 도우미
register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("react-router-dom", { namedExports: { useNavigate: () => () => {} } })

const { renderHook, cleanup } = await import("@testing-library/react")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { applyTribunalResolvedPure } = await import("../../../../../src/domains/game/ingame/store/applyTribunalResolved.js")
const { parsePlayerEliminatedPayload } = await import("../../../../../src/domains/game/ingame/utils/parsePlayerEliminatedPayload.js")

const GAME_ID = "game-defendant-left"
const SELF = "uuid-self"
const DEF = "uuid-defendant"
const C = "uuid-c"
const D = "uuid-d"
const E = "uuid-e"
const ALL = [SELF, DEF, C, D, E]

function createFakeSocket() {
  const listeners = new Map()
  return {
    id: "sock-1",
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit() {},
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
  }
}

function seedTribunal() {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "나" }, identityGeneration: 0 })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "TRIBUNAL",
        dayIndex: 1,
        players: ALL.map((uuid) => ({ uuid, nickname: uuid, alive: true, isConnected: true })),
        self: { uuid: SELF, nickname: SELF, role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        tribunal: { defendantUuid: DEF, dayIndex: 1 },
      },
    })
  })
}

const aliveOf = (uuid) => useInGameStore.getState().state.players.find((p) => p.uuid === uuid).alive

test.afterEach(() => {
  cleanup()
  act(() => setSocket(null))
})

test("FE-002: 재판 중 온 NIGHT 사망 방송도 받아 피고를 죽음 처리한다", () => {
  const parsed = parsePlayerEliminatedPayload({
    payload: {
      gameId: GAME_ID, phase: "NIGHT", dayIndex: 1, victimUuid: DEF,
      players: ALL.map((uuid) => ({ uuid, alive: uuid !== DEF })),
    },
    gameId: GAME_ID,
    dayIndex: 1,
    phase: "TRIBUNAL",
    canonicalPlayerIds: new Set(ALL),
    previouslyDeadUuids: new Set(),
  })
  assert.ok(parsed)
  assert.equal(parsed.phase, "TRIBUNAL")
})

test("FE-002: 낮 토론 중 온 NIGHT 사망 방송은 여전히 버린다", () => {
  const parsed = parsePlayerEliminatedPayload({
    payload: {
      gameId: GAME_ID, phase: "NIGHT", dayIndex: 1, victimUuid: DEF,
      players: ALL.map((uuid) => ({ uuid, alive: uuid !== DEF })),
    },
    gameId: GAME_ID, dayIndex: 1, phase: "DAY",
    canonicalPlayerIds: new Set(ALL), previouslyDeadUuids: new Set(),
  })
  assert.equal(parsed, null)
})

test("FE-002: 사망 방송을 놓쳐도 재판 취소(피고 나감)만으로 피고가 죽음 처리된다", () => {
  seedTribunal()
  const patch = applyTribunalResolvedPure(useInGameStore.getState(), {
    gameId: GAME_ID, dayIndex: 1, phase: "NIGHT", defendantUuid: DEF,
    outcome: "CANCELLED", reason: "DEFENDANT_LEFT", counts: { guilty: 1, notGuilty: 0 }, executedUuid: null,
  })
  assert.equal(patch.state.phase, "NIGHT")
  assert.equal(patch.state.players.find((p) => p.uuid === DEF).alive, false)
})

test("FE-002: 서버 순서대로 받으면 피고가 죽고 다음 밤 결과가 받아져 낮으로 넘어간다", () => {
  seedTribunal()
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  renderHook(() => useGameSessionSocketEvents())

  act(() => {
    socket.deliver("player_eliminated", {
      gameId: GAME_ID, phase: "NIGHT", dayIndex: 1, victimUuid: DEF,
      players: ALL.map((uuid) => ({ uuid, alive: uuid !== DEF })),
    })
    socket.deliver("tribunal_vote_resolved", {
      reason: "DEFENDANT_LEFT", gameId: GAME_ID, dayIndex: 1, phase: "NIGHT", defendantUuid: DEF,
      outcome: "CANCELLED", counts: { guilty: 1, notGuilty: 0 }, executedUuid: null, executedRole: null,
    })
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(aliveOf(DEF), false)

  // 다음 밤 결과: 피고 + 이번 피해자(C)가 죽음
  act(() => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 2, victimUuid: C,
      players: ALL.map((uuid) => ({ uuid, alive: uuid !== DEF && uuid !== C })),
    })
  })
  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "DAY")
  assert.equal(state.dayIndex, 2)
  assert.equal(aliveOf(C), false)
})
