import test from "node:test"
import assert from "node:assert/strict"
import {
  consumeInGameTribunalExpulsionPresentation,
  hasPendingInGameTribunalExpulsionPresentation,
  INITIAL_IN_GAME_TRIBUNAL_EXPULSION,
  reduceInGameTribunalExpulsionPresentation,
} from "../reduceInGameTribunalExpulsionPresentation.js"

const GAME_ID = "game-expulsion-1"
const AUTH_UUID = "uuid-self"
const EPOCH = "socket-1#0"
const SCOPE = `${GAME_ID}|${AUTH_UUID}|${EPOCH}`

function expulsionItem(dayIndex, victimUuid) {
  return {
    id: `${GAME_ID}|${dayIndex}|${victimUuid}|TRIBUNAL_EXPULSION|${AUTH_UUID}|${EPOCH}`,
    victimUuid,
  }
}

test("GUILTY가 아니면 큐에 넣지 않는다 — reducer는 빈 items만 처리한다", () => {
  const next = reduceInGameTribunalExpulsionPresentation(INITIAL_IN_GAME_TRIBUNAL_EXPULSION, {
    scope: SCOPE,
    items: [],
    hold: false,
  })
  assert.equal(next.active, null)
  assert.equal(hasPendingInGameTribunalExpulsionPresentation(next), false)
})

test("GUILTY 추방 1건 — 즉시 재생되고 pending이 true다", () => {
  const items = [expulsionItem(2, "victim-1")]
  const playing = reduceInGameTribunalExpulsionPresentation(INITIAL_IN_GAME_TRIBUNAL_EXPULSION, {
    scope: SCOPE,
    items,
    hold: false,
  })
  assert.equal(playing.active.victimUuid, "victim-1")
  assert.deepEqual(playing.queue, [])
  assert.equal(hasPendingInGameTribunalExpulsionPresentation(playing), true)
})

test("hold 중에는 active를 비우고 큐에 되돌린다", () => {
  const items = [expulsionItem(2, "victim-1")]
  const held = reduceInGameTribunalExpulsionPresentation(INITIAL_IN_GAME_TRIBUNAL_EXPULSION, {
    scope: SCOPE,
    items,
    hold: true,
  })
  assert.equal(held.active, null)
  assert.equal(held.queue.length, 1)
  assert.equal(hasPendingInGameTribunalExpulsionPresentation(held), true)

  const released = reduceInGameTribunalExpulsionPresentation(held, {
    scope: SCOPE,
    items: [],
    hold: false,
  })
  assert.equal(released.active.victimUuid, "victim-1")
})

test("consume 후 큐가 비면 pending이 false다", () => {
  const playing = reduceInGameTribunalExpulsionPresentation(INITIAL_IN_GAME_TRIBUNAL_EXPULSION, {
    scope: SCOPE,
    items: [expulsionItem(2, "victim-1")],
    hold: false,
  })
  const done = consumeInGameTribunalExpulsionPresentation(playing, playing.active.id)
  assert.equal(done.active, null)
  assert.equal(hasPendingInGameTribunalExpulsionPresentation(done), false)
})
