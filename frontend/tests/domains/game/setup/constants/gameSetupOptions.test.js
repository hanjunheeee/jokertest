import test from "node:test"
import assert from "node:assert/strict"
import { GENERAL_GAME_SETUP } from "../../../../../src/domains/game/setup/constants/gameSetupOptions.js"

test("FE-006: 방 만들기 최대 인원은 한 판 규칙대로 5~10명만 고를 수 있음", () => {
  const maxPlayers = GENERAL_GAME_SETUP.find((item) => item.id === "max-players")
  assert.equal(maxPlayers.min, 5)
  assert.equal(maxPlayers.max, 10)
})
