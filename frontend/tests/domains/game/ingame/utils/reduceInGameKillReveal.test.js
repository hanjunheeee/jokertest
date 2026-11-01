import test from "node:test"
import assert from "node:assert/strict"
import {
  consumeInGameKillReveal,
  hasPendingInGameKillReveal,
  INITIAL_IN_GAME_KILL_REVEAL,
  reduceInGameKillReveal,
} from "../../../../../src/domains/game/ingame/utils/reduceInGameKillReveal.js"
import { buildInGameKillRevealQueueItems } from "../../../../../src/domains/game/ingame/utils/nightDeathReveals.js"

const GAME_ID = "game-kill-1"
const AUTH_UUID = "uuid-self"
const EPOCH = "socket-1#0"
const SCOPE = `${GAME_ID}|${AUTH_UUID}|${EPOCH}`

function nightItems(dayIndex, deathReveals) {
  return buildInGameKillRevealQueueItems({
    gameId: GAME_ID,
    authUuid: AUTH_UUID,
    epoch: EPOCH,
    nightResult: { dayIndex, deathReveals },
  })
}

function tribunalItem(dayIndex, victimUuid) {
  return {
    id: `${GAME_ID}|${dayIndex}|${victimUuid}|TRIBUNAL|${AUTH_UUID}|${EPOCH}`,
    victimUuid,
    source: "TRIBUNAL",
  }
}

test("AC-03: 사망자 0명 — 큐에 아무것도 들어가지 않고 결과 이동을 보류하지 않는다", () => {
  const items = nightItems(2, [])
  assert.deepEqual(items, [])

  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })
  assert.equal(next.active, null)
  assert.deepEqual(next.queue, [])
  assert.equal(hasPendingInGameKillReveal(next), false, "보류할 연출이 없다")
})

test("AC-03: 사망자 1명 — 즉시 재생되고, 재생이 끝날 때까지 결과 이동이 보류된다", () => {
  const items = nightItems(2, [{ victimUuid: "victim-1", source: "JOKER" }])
  assert.equal(items.length, 1)

  const playing = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })
  assert.equal(playing.active.victimUuid, "victim-1")
  assert.equal(playing.active.source, "JOKER")
  assert.deepEqual(playing.queue, [])
  assert.equal(hasPendingInGameKillReveal(playing), true, "재생 중에는 이동을 보류한다")

  const done = consumeInGameKillReveal(playing, playing.active.id)
  assert.equal(done.active, null)
  assert.equal(hasPendingInGameKillReveal(done), false, "마지막 연출이 끝나야 이동한다")
})

test("AC-03: 사망자 2명 — payload 순서대로 하나씩 재생되고, 마지막이 끝날 때까지 계속 보류된다", () => {
  const items = nightItems(3, [
    { victimUuid: "victim-1", source: "JOKER" },
    { victimUuid: "victim-2", source: "UNKNOWN_NIGHT" },
  ])
  assert.equal(items.length, 2)

  const first = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })
  assert.equal(first.active.victimUuid, "victim-1")
  assert.equal(first.queue.length, 1, "두 번째는 대기한다")
  assert.equal(hasPendingInGameKillReveal(first), true)

  const second = consumeInGameKillReveal(first, first.active.id)
  assert.equal(second.active.victimUuid, "victim-2")
  assert.deepEqual(second.queue, [])
  assert.equal(hasPendingInGameKillReveal(second), true, "두 번째가 남아 있는 동안에도 보류한다")

  const done = consumeInGameKillReveal(second, second.active.id)
  assert.equal(done.active, null)
  assert.equal(hasPendingInGameKillReveal(done), false)
})

test("AC-03: 같은 방송이 다시 도착해도 이미 본 연출은 큐에 두 번 들어가지 않는다", () => {
  const items = nightItems(2, [{ victimUuid: "victim-1", source: "JOKER" }])

  const first = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })
  const again = reduceInGameKillReveal(first, { scope: SCOPE, items, hold: false })
  assert.equal(again, first, "변화가 없으면 참조까지 그대로다(리렌더 없음)")

  const done = consumeInGameKillReveal(first, first.active.id)
  const afterReplay = reduceInGameKillReveal(done, { scope: SCOPE, items, hold: false })
  assert.equal(afterReplay.active, null, "이미 재생한 연출은 다시 뜨지 않는다")
  assert.deepEqual(afterReplay.queue, [])
})

test("AC-03: 재판 처형도 같은 큐로 들어가고, 밤 사망과 id가 겹치지 않는다", () => {
  const executed = tribunalItem(2, "victim-1")
  const night = nightItems(2, [{ victimUuid: "victim-1", source: "JOKER" }])
  assert.notEqual(executed.id, night[0].id, "출처가 다르면 같은 밤·같은 사람이어도 다른 연출이다")

  const playing = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: SCOPE,
    items: [executed],
    hold: false,
  })
  assert.equal(playing.active.source, "TRIBUNAL")
  assert.equal(hasPendingInGameKillReveal(playing), true)
})

test("AC-03: 재판 사망자 0명 — 처형 없는 판정은 큐에 아무것도 넣지 않고 이동도 막지 않는다", () => {
  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items: [], hold: false })
  assert.equal(next.active, null)
  assert.deepEqual(next.queue, [])
  assert.equal(hasPendingInGameKillReveal(next), false, "보류할 연출이 없다")
})

test("AC-03: 재판 처형 + 그 밤의 사망 2명 — 도착 순서대로 재생되고 마지막까지 보류한다", () => {
  const executed = tribunalItem(2, "victim-1")
  const night = nightItems(2, [{ victimUuid: "victim-2", source: "WITCH_HUNTER" }])

  const first = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: SCOPE,
    items: [executed],
    hold: false,
  })
  assert.equal(first.active.source, "TRIBUNAL")

  const queued = reduceInGameKillReveal(first, { scope: SCOPE, items: night, hold: false })
  assert.equal(queued.active.victimUuid, "victim-1")
  assert.deepEqual(queued.queue.map((item) => item.victimUuid), ["victim-2"])
  assert.equal(hasPendingInGameKillReveal(queued), true)

  const second = consumeInGameKillReveal(queued, queued.active.id)
  assert.equal(second.active.victimUuid, "victim-2")
  assert.equal(hasPendingInGameKillReveal(second), true, "두 번째가 남아 있는 동안에도 보류한다")

  const done = consumeInGameKillReveal(second, second.active.id)
  assert.equal(done.active, null)
  assert.equal(hasPendingInGameKillReveal(done), false, "마지막 연출이 끝나야 이동한다")
})

test("AC-03: hold가 걸리면 재생 중이던 연출은 소비되지 않고 큐 맨 앞으로 돌아간다", () => {
  const items = nightItems(2, [
    { victimUuid: "victim-1", source: "JOKER" },
    { victimUuid: "victim-2", source: "OTHER" },
  ])
  const playing = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })

  const held = reduceInGameKillReveal(playing, { scope: SCOPE, items: [], hold: true })
  assert.equal(held.active, null, "hold 중에는 아무것도 떠 있지 않다")
  assert.deepEqual(
    held.queue.map((item) => item.victimUuid),
    ["victim-1", "victim-2"],
    "재생 중이던 항목이 순서를 잃지 않고 큐 맨 앞으로 돌아간다",
  )
  assert.equal(hasPendingInGameKillReveal(held), true, "hold 중에도 결과 이동은 보류된다")

  const resumed = reduceInGameKillReveal(held, { scope: SCOPE, items: [], hold: false })
  assert.equal(resumed.active.victimUuid, "victim-1")
})

test("AC-03: 이전 연출의 늦은 완료 콜백은 새로 뜬 연출을 대신 소비하지 않는다", () => {
  const items = nightItems(2, [
    { victimUuid: "victim-1", source: "JOKER" },
    { victimUuid: "victim-2", source: "OTHER" },
  ])
  const first = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })
  const staleId = first.active.id
  const second = consumeInGameKillReveal(first, staleId)
  assert.equal(second.active.victimUuid, "victim-2")

  const unchanged = consumeInGameKillReveal(second, staleId)
  assert.equal(unchanged, second, "id가 다르면 아무 일도 하지 않는다")
})

test("scope(게임·계정·소켓 세대)가 바뀌면 이전 세션의 큐를 통째로 버린다", () => {
  const items = nightItems(2, [{ victimUuid: "victim-1", source: "JOKER" }])
  const playing = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, { scope: SCOPE, items, hold: false })

  const rescoped = reduceInGameKillReveal(playing, { scope: "other-scope", items: [], hold: false })
  assert.equal(rescoped.active, null)
  assert.deepEqual(rescoped.queue, [])
  assert.deepEqual(rescoped.seenIds, [])
  assert.equal(hasPendingInGameKillReveal(rescoped), false)
})

test("roster에 없는 희생자는 호출부가 걸러낸 뒤에도 큐의 순서를 흔들지 않는다", () => {
  const canonical = new Set(["victim-2"])
  const filtered = nightItems(2, [
    { victimUuid: "victim-1", source: "JOKER" },
    { victimUuid: "victim-2", source: "OTHER" },
  ]).filter((item) => canonical.has(item.victimUuid))

  const next = reduceInGameKillReveal(INITIAL_IN_GAME_KILL_REVEAL, {
    scope: SCOPE,
    items: filtered,
    hold: false,
  })
  assert.equal(next.active.victimUuid, "victim-2")
  assert.deepEqual(next.queue, [])
})
