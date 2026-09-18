import test from "node:test"
import assert from "node:assert/strict"

import { createLeaveGameSessionRequest } from "../createLeaveGameSessionRequest.js"

/**
 * F-21(AC-05): 명시적 이탈 요청의 **ack 소유권** 계약.
 *
 * gameId만 비교하던 시절에는 같은 판이 유지되는 한 어떤 ack도 "내 것"이었다. 그런데 응답을
 * 기다리는 사이에 계정이 바뀌거나(A→B→A), 연결이 교체되거나, 같은 판에 다시 들어와 새 소속이
 * 생길 수 있다 — 그때 도착한 옛 ack로 화면을 끝내면 지금 진행 중인 판이 남의 요청 결과로
 * 정리된다. 네 축을 모두 다시 확인해야 한다.
 */
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
  // 실제 Socket.IO처럼 id를 갖는다 — 재연결은 **객체를 바꾸지 않고** id만 바꾼다.
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
  // 같은 계정으로 돌아왔지만 같은 판에 다시 들어와 새 소속을 받았다.
  h.current.membershipId = "mem-2"
  h.emitted[0].ack({ ok: true })

  assert.equal(h.finalized.length, 0)
})

test("AC-05: A→B→A인데 **소속도 소켓도 그대로**여도 옛 ack는 되살아나지 않는다(전이 세대)", () => {
  const h = harness()
  h.request()

  // 로그아웃 → 다른 계정 로그인 → 다시 원래 계정. 값으로만 비교하면 accountId도 membershipId도
  // 소켓 객체도 전부 원래대로라 네 검사가 모두 통과한다 — 전이 **횟수**만이 그 구간을 드러낸다.
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

  // socket.io는 재연결에서 같은 Socket 인스턴스를 재사용하고 id만 새로 받는다.
  // 객체 동일성 검사(getSocket() !== socket)만으로는 이 구간을 전혀 구별하지 못한다.
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
  // getSocket은 프로덕션과 마찬가지로 **같은 참조**를 돌려준다(모듈 싱글턴).
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
