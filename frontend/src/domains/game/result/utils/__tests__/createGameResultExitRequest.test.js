import test from "node:test"
import assert from "node:assert/strict"

import {
  createGameResultExitRequest,
  LEAVE_GAME_SESSION_ACK_TIMEOUT_MS,
} from "../createGameResultExitRequest.js"
import { createSessionEndFinalizer } from "../../../ingame/utils/createSessionEndFinalizer.js"
import { useInGameStore } from "../../../ingame/store/ingameStore.js"

/** timeout(ms).emitWithAck(event, payload) 호출을 기록하고, ack를 테스트가 직접 제어하는 fake socket. */
function createFakeSocket() {
  const calls = []
  const socket = {
    timeoutCalls: [],
    timeout(ms) {
      socket.timeoutCalls.push(ms)
      return socket
    },
    emitWithAck(event, payload) {
      let settle
      const promise = new Promise((resolve, reject) => {
        settle = { resolve, reject }
      })
      calls.push({ event, payload, ...settle })
      return promise
    },
  }
  return { socket, calls }
}

/** ack 프로미스의 await 체인이 실행되도록 microtask 큐를 두 차례 비운다. */
function flush() {
  return Promise.resolve().then(() => Promise.resolve())
}

test("gameId가 있으면 leave_game_session을 5초 timeout ack로 보낸 뒤 finalize한다", async () => {
  const { socket, calls } = createFakeSocket()
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => socket,
    getCurrentGameId: () => "g-1",
    finalize: () => { finalized += 1 },
  })

  const done = request()
  await flush()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].event, "leave_game_session")
  assert.deepEqual(calls[0].payload, { gameId: "g-1" })
  assert.deepEqual(socket.timeoutCalls, [LEAVE_GAME_SESSION_ACK_TIMEOUT_MS])
  // ack가 오기 전에 성급히 이동하지 않는다.
  assert.equal(finalized, 0)

  calls[0].resolve({ ok: true })
  await done

  assert.equal(finalized, 1)
})

test("ack가 실패(ok:false)해도 그대로 finalize한다", async () => {
  const { socket, calls } = createFakeSocket()
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => socket,
    getCurrentGameId: () => "g-1",
    finalize: () => { finalized += 1 },
  })

  const done = request()
  await flush()
  calls[0].resolve({ ok: false, error: "NOT_IN_SESSION" })
  await done

  assert.equal(finalized, 1)
})

test("ack가 timeout으로 reject돼도 finalize하고, 요청 자체는 reject하지 않는다", async () => {
  const { socket, calls } = createFakeSocket()
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => socket,
    getCurrentGameId: () => "g-1",
    finalize: () => { finalized += 1 },
  })

  const done = request()
  await flush()
  calls[0].reject(new Error("operation has timed out"))

  await assert.doesNotReject(() => done)
  assert.equal(finalized, 1)
})

test("preview(gameId 없음)는 socket을 꺼내지도 않고 곧장 finalize한다", async () => {
  const { socket, calls } = createFakeSocket()
  let socketReads = 0
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => { socketReads += 1; return socket },
    getCurrentGameId: () => null,
    finalize: () => { finalized += 1 },
  })

  await request()

  assert.equal(socketReads, 0)
  assert.equal(calls.length, 0)
  assert.equal(finalized, 1)
})

test("socket이 없으면(미연결) emit 없이 finalize한다", async () => {
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => null,
    getCurrentGameId: () => "g-1",
    finalize: () => { finalized += 1 },
  })

  await request()

  assert.equal(finalized, 1)
})

test("ack를 기다리는 동안 다시 눌러도 leave는 한 번만 나간다", async () => {
  const { socket, calls } = createFakeSocket()
  let finalized = 0
  const request = createGameResultExitRequest({
    getSocket: () => socket,
    getCurrentGameId: () => "g-1",
    finalize: () => { finalized += 1 },
  })

  const first = request()
  await flush()
  await request()

  assert.equal(calls.length, 1)
  assert.equal(finalized, 0)

  calls[0].resolve({ ok: true })
  await first

  assert.equal(finalized, 1)
})

test("실제 store 연동: 로비로 이동하고 winResult를 포함한 게임 상태가 정리된다", async () => {
  const { socket, calls } = createFakeSocket()
  const navigateCalls = []
  let clearedRoom = 0

  useInGameStore.getState().setGamePayload({
    gameId: "g-1",
    state: {
      id: "g-1",
      phase: "ENDED",
      players: [{ uuid: "u-1", nickname: "p1" }],
      winResult: { winningTeam: "CITIZEN", players: [] },
    },
  })
  assert.ok(useInGameStore.getState().state?.winResult)

  const request = createGameResultExitRequest({
    getSocket: () => socket,
    getCurrentGameId: () => useInGameStore.getState().gameId,
    finalize: createSessionEndFinalizer({
      clearGame: () => useInGameStore.getState().clearGame(),
      clearRoom: () => { clearedRoom += 1 },
      navigate: (...args) => navigateCalls.push(args),
    }),
  })

  const done = request()
  await flush()
  calls[0].resolve({ ok: true })
  await done

  assert.deepEqual(navigateCalls, [["/multiplay", { replace: true }]])
  assert.equal(clearedRoom, 1)
  assert.equal(useInGameStore.getState().gameId, null)
  assert.equal(useInGameStore.getState().state, null)
  assert.equal(useInGameStore.getState().state?.winResult, undefined)

  useInGameStore.getState().clearGame()
})
