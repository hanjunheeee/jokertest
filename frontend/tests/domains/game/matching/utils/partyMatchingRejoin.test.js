import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { rememberRoomReady, consumeRoomReady } =
  await import("../../../../../src/domains/game/shared/utils/partyMatchingRejoin.js")

const payload = { gameId: "game-1", room: { roomCode: "ABC123", roomId: "r1" } }

test("known 3장: 먼저 온 파티 방 방송은 받은 계정에서만 꺼냄 (계정이 바뀌면 버림)", () => {
  useAuthStore.setState({ user: { uuid: "a" }, isLoggedIn: true })
  rememberRoomReady(payload)
  useAuthStore.setState({ user: { uuid: "b" }, isLoggedIn: true })
  assert.equal(consumeRoomReady("game-1"), null)
  useAuthStore.setState({ user: { uuid: "a" }, isLoggedIn: true })
  assert.equal(consumeRoomReady("game-1"), null, "다른 계정이 본 뒤엔 버려져 남지 않음")
})

test("같은 계정이면 그대로 꺼냄", () => {
  useAuthStore.setState({ user: { uuid: "a" }, isLoggedIn: true })
  rememberRoomReady(payload)
  assert.deepEqual(consumeRoomReady("game-1"), payload)
  assert.equal(consumeRoomReady("game-1"), null)
})
