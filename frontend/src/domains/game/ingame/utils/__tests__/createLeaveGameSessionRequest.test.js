import test from "node:test"
import assert from "node:assert/strict"

import { createLeaveGameSessionRequest } from "../createLeaveGameSessionRequest.js"

function harness(overrides = {}) {
  const emitted = []
  const finalized = []
  const failures = []
  const current = {
    gameId: "game-1",
    accountId: "acct-1",
    membershipId: "mem-1",
    ...overrides,
  }
  const socket = { id: "sock-1", emit: (event, payload, ack) => emitted.push({ event, payload, ack }) }
  const state = { socket, identityGeneration: 1 }

  const request = createLeaveGameSessionRequest({
    getSocket: () => state.socket,
    getCurrentGameId: () => current.gameId,
    getCurrentAccountId: () => current.accountId,
    getCurrentMembershipId: () => current.membershipId,
    getIdentityGeneration: () => state.identityGeneration,
    finalize: () => finalized.push(true),
    onFailure: (response) => failures.push(response),
  })

  return { request, emitted, finalized, failures, current, state, socket }
}

test("AC-05: 정상 경로 — 지금 이 판·계정·연결·소속의 성공 ack만 세션을 끝낸다", () => {
  const h = harness()
  h.request()

  assert.equal(h.emitted.length, 1)
  assert.equal(h.emitted[0].event, "leave_game_session")
  assert.deepEqual(h.emitted[0].payload, { gameId: "game-1" })

  h.emitted[0].ack({ ok: true })
  assert.equal(h.finalized.length, 1)
  assert.equal(h.failures.length, 0)
})

test("AC-05: ack가 오기 전에 판이 바뀌면 성공 ack도 무시된다", () => {
  const h = harness()
  h.request()
  h.current.gameId = "game-2"
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0)
  assert.equal(h.failures.length, 0)
})

test("AC-05: ack가 오기 전에 계정이 바뀌면 그 ack는 현재 화면의 것이 아니다", () => {
  const h = harness()
  h.request()
  h.current.accountId = "acct-2"
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0)
  assert.equal(h.failures.length, 0)
})

test("AC-05: A→B→A로 돌아와도 옛 ack는 되살아나지 않는다(소속이 다르다)", () => {
  const h = harness()
  h.request()
  h.current.accountId = "acct-2"
  h.current.accountId = "acct-1"
  h.current.membershipId = "mem-2"
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0)
})

test("AC-05: A→B→A인데 **소속도 소켓도 그대로**여도 옛 ack는 되살아나지 않는다(전이 세대)", () => {
  const h = harness()
  h.request()

  h.state.identityGeneration = 2
  h.state.identityGeneration = 3
  h.state.identityGeneration = 4
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0, "A→B→A 구간을 지난 옛 ack가 현재 판을 끝냈다")
  assert.equal(h.failures.length, 0)
})

test("AC-05: **같은 Socket 객체가 재연결**돼도(id만 교체) 그 이전 요청의 ack는 무시된다", () => {
  const h = harness()
  h.request()

  h.socket.id = "sock-2"
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0, "재연결 이전 요청의 ack가 현재 연결의 것으로 처리됐다")
  assert.equal(h.failures.length, 0)
})

test("AC-05: ack가 오기 전에 연결이 교체되면 그 ack는 무시된다", () => {
  const h = harness()
  h.request()
  h.state.socket = { emit: () => {} }
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0)
  assert.equal(h.failures.length, 0)
})

test("AC-05: 실패 ack는 현재 소속의 것일 때만 안내로 이어진다", () => {
  const h = harness()
  h.request()
  h.emitted[0].ack({ ok: false, code: "NOT_IN_SESSION" })
  assert.deepEqual(h.failures, [{ ok: false, code: "NOT_IN_SESSION" }])
  assert.equal(h.finalized.length, 0)

  const stale = harness()
  stale.request()
  stale.current.membershipId = "mem-9"
  stale.emitted[0].ack({ ok: false, code: "NOT_IN_SESSION" })
  assert.deepEqual(stale.failures, [], "지나간 소속의 실패는 현재 화면에 표시하지 않는다")
})

test("AC-05: 연결이 없거나 판이 없으면 요청 자체가 나가지 않는다", () => {
  const noSocket = harness()
  noSocket.state.socket = null
  noSocket.request()
  assert.equal(noSocket.emitted.length, 0)

  const noGame = harness({ gameId: null })
  noGame.request()
  assert.equal(noGame.emitted.length, 0)
})

test("AC-05: 계정·소속 접근자를 주지 않아도 기존 gameId 계약은 그대로 동작한다", () => {
  const emitted = []
  const finalized = []
  const socket = { emit: (event, payload, ack) => emitted.push({ event, payload, ack }) }
  const request = createLeaveGameSessionRequest({
    getSocket: () => socket,
    getCurrentGameId: () => "game-1",
    finalize: () => finalized.push(true),
  })
  request()
  emitted[0].ack({ ok: true })
  assert.equal(finalized.length, 1)
})
