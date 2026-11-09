// 판 중 다른 사람 끊김 알림 (모바일 M-2): 서버 session_player_connection_changed → 명단 isConnected
import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../../../../../src/domains/game/ingame/store/ingameStore.js"
import { onSessionEvents } from "../../../../../src/domains/game/ingame/socket/session.js"

const GAME_ID = "game-conn"

function seed() {
  useInGameStore.getState().clearGame()
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "DAY",
      dayIndex: 1,
      players: [
        { uuid: "u1", nickname: "A", alive: true, isConnected: true },
        { uuid: "u2", nickname: "B", alive: true, isConnected: true },
      ],
      self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    },
    error: null,
  })
}

const connectedOf = (uuid) => useInGameStore.getState().state.players.find((p) => p.uuid === uuid).isConnected

test("끊김·다시 붙음 알림이 명단 연결 상태를 바꿈", () => {
  seed()
  useInGameStore.getState().applyPlayerConnectionChanged({ gameId: GAME_ID, uuid: "u2", isConnected: false })
  assert.equal(connectedOf("u2"), false)
  assert.equal(connectedOf("u1"), true)
  useInGameStore.getState().applyPlayerConnectionChanged({ gameId: GAME_ID, uuid: "u2", isConnected: true })
  assert.equal(connectedOf("u2"), true)
})

test("다른 판·모르는 사람·틀린 값은 무시", () => {
  seed()
  const before = useInGameStore.getState().state
  useInGameStore.getState().applyPlayerConnectionChanged({ gameId: "other", uuid: "u2", isConnected: false })
  useInGameStore.getState().applyPlayerConnectionChanged({ gameId: GAME_ID, uuid: "nobody", isConnected: false })
  useInGameStore.getState().applyPlayerConnectionChanged({ gameId: GAME_ID, uuid: "u2", isConnected: "no" })
  assert.equal(useInGameStore.getState().state, before)
})

test("판 진행 사건 묶음이 session_player_connection_changed를 playerConnectionChanged 손잡이로 붙이고 뗌", () => {
  const handlers = new Map()
  const socket = {
    on(event, fn) { handlers.set(event, fn) },
    off(event, fn) { if (handlers.get(event) === fn) handlers.delete(event) },
  }
  const calls = []
  const made = new Map()
  const h = new Proxy({}, {
    get: (_t, key) => {
      if (!made.has(key)) made.set(key, (payload) => calls.push([key, payload]))
      return made.get(key)
    },
  })
  const off = onSessionEvents(socket, h)
  assert.ok(handlers.has("session_player_connection_changed"))
  handlers.get("session_player_connection_changed")({ gameId: GAME_ID })
  assert.equal(calls.at(-1)[0], "playerConnectionChanged")
  off()
  assert.equal(handlers.size, 0, "끌 때 전부 뗌")
})
