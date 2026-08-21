import test from "node:test"
import assert from "node:assert/strict"

import {
  consumeInGameKillReveal,
  INITIAL_IN_GAME_KILL_REVEAL,
  reduceInGameKillReveal,
} from "../reduceInGameKillReveal.js"

function item(id, victimUuid = "p1", source = "OTHER") {
  return { id, victimUuid, source }
}

test("초기 상태는 scope/active 모두 null이고 큐가 비어 있다", () => {
  assert.equal(INITIAL_IN_GAME_KILL_REVEAL.scope, null)
  assert.equal(INITIAL_IN_GAME_KILL_REVEAL.active, null)
  assert.deepEqual(INITIAL_IN_GAME_KILL_REVEAL.queue, [])
})

test("새 항목이 들어오면 hold가 아닐 때 즉시 active로 승격된다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a")],
    hold: false,
  })
  assert.equal(next.active.id, "a")
  assert.deepEqual(next.queue, [])
})

test("hold가 true면 새 항목이 큐에만 쌓이고 active로 승격되지 않는다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a")],
    hold: true,
  })
  assert.equal(next.active, null)
  assert.deepEqual(next.queue, [item("a")])
})

test("여러 사망 연출이 동시에 들어오면 도착 순서대로 큐에 쌓이고 첫 항목만 승격된다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a"), item("b"), item("c")],
    hold: false,
  })
  assert.equal(next.active.id, "a")
  assert.deepEqual(next.queue.map((i) => i.id), ["b", "c"])
})

test("consumeInGameKillReveal: active를 소비하면 큐의 다음 항목이 곧바로 승격된다(멀티 사망 연출 이어보기)", () => {
  const withThree = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a"), item("b"), item("c")],
    hold: false,
  })

  const afterFirst = consumeInGameKillReveal(withThree, "a")
  assert.equal(afterFirst.active.id, "b")
  assert.deepEqual(afterFirst.queue.map((i) => i.id), ["c"])

  const afterSecond = consumeInGameKillReveal(afterFirst, "b")
  assert.equal(afterSecond.active.id, "c")
  assert.deepEqual(afterSecond.queue, [])

  const afterThird = consumeInGameKillReveal(afterSecond, "c")
  assert.equal(afterThird.active, null)
  assert.deepEqual(afterThird.queue, [])
})

test("consumeInGameKillReveal: id가 지금 active와 다르면(stale) 아무 일도 하지 않고 참조를 그대로 보존한다", () => {
  const withOne = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a")],
    hold: false,
  })

  const result = consumeInGameKillReveal(withOne, "old-stale-id")
  assert.equal(result, withOne)
  assert.equal(result.active.id, "a")
})

test("consumeInGameKillReveal: active가 없으면 참조를 그대로 보존한다", () => {
  const result = consumeInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, "anything")
  assert.equal(result, INITIAL_IN_GAME_KILL_REVEAL)
})

test("같은 id가 중복으로 들어오면(같은 payload 재수신·리렌더·StrictMode) 다시 큐에 넣지 않는다", () => {
  const first = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a")],
    hold: false,
  })
  const consumed = consumeInGameKillReveal(first, "a")

  const replay = reduceInGameKillReveal(consumed, { scope: "s1", items: [item("a")], hold: false })
  assert.equal(replay.active, null)
  assert.deepEqual(replay.queue, [])
})

test("같은 payload 안에 동일 id가 중복으로 들어와도 한 번만 큐에 들어간다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a"), item("a")],
    hold: false,
  })
  assert.equal(next.active.id, "a")
  assert.deepEqual(next.queue, [])
})

test("active가 떠 있는데 hold가 걸리면(역할 공개가 새로 열림) 소비되지 않고 큐 맨 앞으로 되돌아간다", () => {
  const active = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [item("a"), item("b")],
    hold: false,
  })
  assert.equal(active.active.id, "a")

  const held = reduceInGameKillReveal(active, { scope: "s1", items: [], hold: true })
  assert.equal(held.active, null)
  assert.deepEqual(held.queue.map((i) => i.id), ["a", "b"])

  const released = reduceInGameKillReveal(held, { scope: "s1", items: [], hold: false })
  assert.equal(released.active.id, "a", "hold가 풀리면 원래 순서대로 재개된다")
})

test("scope가 바뀌면(다른 게임/계정/소켓 세대) seenIds·큐·active를 전부 버린다", () => {
  const withActive = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "game-1|u1|epoch-1",
    items: [item("a"), item("b")],
    hold: false,
  })
  assert.equal(withActive.active.id, "a")

  const scopeChanged = reduceInGameKillReveal(withActive, {
    scope: "game-2|u1|epoch-1",
    items: [],
    hold: false,
  })
  assert.equal(scopeChanged.active, null)
  assert.deepEqual(scopeChanged.queue, [])
  assert.deepEqual(scopeChanged.seenIds, [])
})

test("변화가 없는 재호출은 입력 state 참조를 그대로 돌려준다(리렌더 유발 없음)", () => {
  const state = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [],
    hold: false,
  })
  const again = reduceInGameKillReveal(state, { scope: "s1", items: [], hold: false })
  assert.equal(again, state)
})

test("id가 없거나 문자열이 아닌 항목은 조용히 무시된다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: "s1",
    items: [null, { victimUuid: "p1" }, { id: 42 }, item("valid")],
    hold: false,
  })
  assert.equal(next.active.id, "valid")
  assert.deepEqual(next.queue, [])
})
