import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("sessionStorage", dom.window.sessionStorage)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
dom.window.alert = (message) => { alerts.push(message) }

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

// 화면 이동은 기록만
const navigations = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (to, options) => { navigations.push({ to, options }) } },
})

// 인게임 스토어 대신 판 정보만 든 작은 스토어
const ingame = { gameId: "game-1", hostUuid: "host", state: { id: "game-1", phase: "ENDED" }, cleared: 0 }
mock.module("../../../../../src/domains/game/ingame/store/ingameStore.js", {
  namedExports: {
    useInGameStore: {
      getState: () => ({
        ...ingame,
        clearGame: () => { ingame.cleared += 1; ingame.gameId = null; ingame.state = null },
      }),
    },
  },
})

const { renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useGameResultReturnToMatching } = await import("../../../../../src/domains/game/result/hooks/useGameResultReturnToMatching.js")

// 이벤트마다 정한 답을 주는 가짜 소켓 (answer가 약속이면 그만큼 늦게 답함)
function fakeSocket(answers) {
  const socket = {
    connected: true,
    timeout() { return socket },
    emitWithAck(event) {
      const answer = answers[event]
      return typeof answer === "function" ? answer() : Promise.resolve(answer)
    },
    on() {},
    off() {},
    emit() {},
  }
  return socket
}

function reset() {
  cleanup()
  navigations.length = 0
  alerts.length = 0
  Object.assign(ingame, { gameId: "game-1", hostUuid: "host", state: { id: "game-1", phase: "ENDED" }, cleared: 0 })
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "host" } })
}

test("known 1-6: 방장 방 만들기를 서버가 거절하면 판 정보를 안 지워 결과 화면이 그대로 남음", async () => {
  reset()
  setSocket(fakeSocket({
    get_current_room: { ok: true, room: null },
    create_room: { ok: false, message: "방을 만들 수 없습니다." },
  }))
  const { result } = renderHook(() => useGameResultReturnToMatching())
  await act(async () => { await result.current.requestReturnToMatching() })
  assert.equal(ingame.cleared, 0)
  assert.deepEqual(alerts, ["방을 만들 수 없습니다."])
  assert.equal(navigations.length, 0)
  assert.equal(result.current.isReturning, false)
})

test("known 1-6: 방장 방 만들기가 되면 그때 판 정보를 지우고 대기방으로 감", async () => {
  reset()
  setSocket(fakeSocket({
    get_current_room: { ok: true, room: null },
    create_room: { ok: true, room: { roomId: "r1", roomCode: "ABC123", players: [], hostUuid: "host" } },
  }))
  const { result } = renderHook(() => useGameResultReturnToMatching())
  await act(async () => { await result.current.requestReturnToMatching() })
  assert.equal(ingame.cleared, 1)
  assert.equal(navigations[0]?.to, "/game-matching")
})

test("FE-029: 응답 전에 화면을 떠나면 늦게 온 방 만들기 응답이 대기방으로 끌고 가지 않음", async () => {
  reset()
  let release
  const late = new Promise((resolve) => { release = resolve })
  setSocket(fakeSocket({
    get_current_room: { ok: true, room: null },
    create_room: () => late,
  }))
  const { result, unmount } = renderHook(() => useGameResultReturnToMatching())
  let pending
  act(() => { pending = result.current.requestReturnToMatching() })
  unmount()
  release({ ok: true, room: { roomId: "r1", roomCode: "ABC123", players: [], hostUuid: "host" } })
  await pending
  assert.equal(navigations.length, 0)
  assert.equal(ingame.cleared, 0)
})

test("FE-029: 응답 전에 계정이 바뀌면 옛 응답을 버림", async () => {
  reset()
  let release
  const late = new Promise((resolve) => { release = resolve })
  setSocket(fakeSocket({
    get_current_room: { ok: true, room: null },
    create_room: () => late,
  }))
  const { result } = renderHook(() => useGameResultReturnToMatching())
  let pending
  act(() => { pending = result.current.requestReturnToMatching() })
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "other" } })
  release({ ok: true, room: { roomId: "r1", roomCode: "ABC123", players: [], hostUuid: "host" } })
  await act(async () => { await pending })
  assert.equal(navigations.length, 0)
})

test("참가자는 끝난 판 id를 실어 파티 방 기다리러 감 (끝난 판 나가기는 안 보냄)", async () => {
  reset()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "guest" } })
  const emitted = []
  const socket = fakeSocket({ get_current_room: { ok: true, room: null } })
  socket.emit = (event) => { emitted.push(event) }
  setSocket(socket)
  const { result } = renderHook(() => useGameResultReturnToMatching())
  await act(async () => { await result.current.requestReturnToMatching() })
  assert.equal(navigations[0]?.to, "/game-matching")
  assert.equal(navigations[0]?.options?.state?.awaitRoomAfterGameResult, true)
  assert.equal(navigations[0]?.options?.state?.endedGameId, "game-1")
  assert.equal(emitted.includes("leave_game_session"), false)
})
