import test from "node:test"
import assert from "node:assert/strict"

import { selectOwnedGameChatContext } from "../selectOwnedGameChatContext.js"

const GAME_ID = "game-1"
const ME = "me-uuid"
const OTHER = "other-uuid"

const EMPTY = { gameId: null, viewChannel: null, sendChannel: null }

function buildState({ phase = "DAY", alive = true, selfUuid = ME } = {}) {
  return {
    id: GAME_ID,
    phase,
    dayIndex: 1,
    players: [
      { uuid: selfUuid, nickname: "Me", alive },
      { uuid: OTHER, nickname: "Other", alive: true },
    ],
    self: { uuid: selfUuid, nickname: "Me", role: "CITIZEN", team: "CITIZEN" },
  }
}

test("selectOwnedGameChatContext: 인증 계정이 소유한 상태면 gameId와 두 채널을 그대로 유도한다", () => {
  const alive = selectOwnedGameChatContext({ gameId: GAME_ID, state: buildState() }, ME)
  assert.deepEqual(alive, { gameId: GAME_ID, viewChannel: "DAY", sendChannel: "DAY" })

  const dead = selectOwnedGameChatContext({ gameId: GAME_ID, state: buildState({ phase: "NIGHT", alive: false }) }, ME)
  assert.deepEqual(dead, { gameId: GAME_ID, viewChannel: "DEAD", sendChannel: "DEAD" })
})

test("selectOwnedGameChatContext: 보낼 수 없는 phase에서도 보기 채널은 유지된다(기존 규칙 그대로)", () => {
  const night = selectOwnedGameChatContext({ gameId: GAME_ID, state: buildState({ phase: "NIGHT" }) }, ME)
  assert.deepEqual(night, { gameId: GAME_ID, viewChannel: "DAY", sendChannel: null })
})

test("selectOwnedGameChatContext: self.uuid가 인증 uuid와 다르면(계정 전환 직후 남은 상태) 전부 null이다", () => {
  // 이전 계정(ME)의 게임 상태가 store에 남아 있는데 지금 로그인한 계정은 다른 사람이다.
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: buildState() }, "another-account"), EMPTY)
})

test("selectOwnedGameChatContext: 인증 계정이 없으면(로그아웃·미확정) 전부 null이다", () => {
  for (const authUuid of [null, undefined, "", 42, {}]) {
    assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: buildState() }, authUuid), EMPTY)
  }
})

test("selectOwnedGameChatContext: gameId가 없거나 문자열이 아니면 전부 null이다", () => {
  for (const gameId of [null, undefined, "", 42, {}]) {
    assert.deepEqual(selectOwnedGameChatContext({ gameId, state: buildState() }, ME), EMPTY)
  }
})

test("selectOwnedGameChatContext: state가 없거나 self가 없으면 전부 null이다(fail-closed)", () => {
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: null }, ME), EMPTY)
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: [] }, ME), EMPTY)
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: { phase: "DAY" } }, ME), EMPTY)
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state: { phase: "DAY", self: null } }, ME), EMPTY)
  assert.deepEqual(selectOwnedGameChatContext(undefined, ME), EMPTY)
})

test("selectOwnedGameChatContext: 생존 여부를 알 수 없으면 소유자여도 두 채널이 모두 null이다", () => {
  // roster에 self가 없어 canonical alive를 유도할 수 없는 상태(fail-closed).
  const state = { ...buildState(), players: [{ uuid: OTHER, nickname: "Other", alive: true }] }
  assert.deepEqual(selectOwnedGameChatContext({ gameId: GAME_ID, state }, ME), {
    gameId: GAME_ID,
    viewChannel: null,
    sendChannel: null,
  })
})
