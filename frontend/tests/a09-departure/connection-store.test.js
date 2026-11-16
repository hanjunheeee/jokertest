// 끊김·돌아옴 알림을 받은 뒤 카드 상태 시험(화면 상태): 끊김·돌아옴·다른 판 무시·스냅샷 끊김·죽고 끊김·빠진 죽은 사람·명단 밖 사람·탈락 뒤 늦은 돌아옴
// 목록 A09-끊김-나가기-탈주.md A09-F-074~079·181~182, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/connection-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { isSessionPlayerAlive } = await import("../../src/domains/game/ingame/utils/actionTargets.js")

test.afterEach(() => K.reset())

const playerOf = (uuid) => K.sessionPlayers().find((p) => p.id === uuid) ?? null

test("A09-F-074 6명 판 낮 투표 중 3번 자리 isConnected false 알림 → 그 사람 카드 끊김", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  await K.renderEventsOnly()
  await t.say("session_player_connection_changed", t.connectionPayload(3, false))
  assert.equal(K.cardStatusOf(t.uuid(3)), "disconnected")
})

test("A09-F-075 7명 판 끊긴 4번 자리 isConnected true 알림 → 돌아옴(생존)", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], disconnected: [4] })
  await K.renderEventsOnly()
  assert.equal(K.cardStatusOf(t.uuid(4)), "disconnected", "처음엔 끊김")
  await t.say("session_player_connection_changed", t.connectionPayload(4, true))
  assert.equal(K.cardStatusOf(t.uuid(4)), "alive")
})

test("A09-F-076 8명 판 다른 판 id로 온 끊김 알림 → 무시(그 사람 생존 그대로) [지금 동작]", async () => {
  const t = K.seat({ n: 8, me: 1, jokers: [0, 2] })
  await K.renderEventsOnly()
  await t.say("session_player_connection_changed", t.connectionPayload(5, false, { gameId: "a09-other-game" }))
  assert.equal(K.cardStatusOf(t.uuid(5)), "alive")
})

test("A09-F-077 5명 판 스냅샷에 2번 자리 isConnected false → 그 카드 끊김", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0], disconnected: [2] })
  assert.equal(K.cardStatusOf(t.uuid(2)), "disconnected")
})

test("A09-F-078 10명 판 처형된 6번 자리가 끊김 → 끊김 배지, 생사는 죽음 그대로", async () => {
  const t = K.seat({ n: 10, me: 1, jokers: [0, 2], dead: [6] })
  await K.renderEventsOnly()
  await t.say("session_player_connection_changed", t.connectionPayload(6, false))
  const p = playerOf(t.uuid(6))
  assert.equal(p.status, "disconnected")
  assert.equal(p.alive, false)
  assert.equal(isSessionPlayerAlive(p), false)
})

test("A09-F-079 6명 판 판에서 빠진 죽은 사람(참여 끝) → 카드 사망", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], left: [4] })
  assert.equal(K.cardStatusOf(t.uuid(4)), "dead")
})

test("A09-F-181 7명 판 명단에 없는 사람 id로 끊김 알림 → 카드 상태 안 바뀜", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  await K.renderEventsOnly()
  const before = K.sessionPlayers().map((p) => p.status).join(",")
  await t.say("session_player_connection_changed", t.connectionPayload(0, false, { uuid: "a09-stranger" }))
  assert.equal(K.sessionPlayers().map((p) => p.status).join(","), before)
})

test("A09-F-182 8명 판 끊긴 3번 자리 player_eliminated → 늦게 온 isConnected true → 사망 그대로", async () => {
  const t = K.seat({ n: 8, me: 1, jokers: [0, 2], disconnected: [3] })
  await K.renderEventsOnly()
  await t.say("player_eliminated", t.eliminatedPayload(3))
  await t.say("session_player_connection_changed", t.connectionPayload(3, true))
  assert.equal(K.cardStatusOf(t.uuid(3)), "dead")
})
