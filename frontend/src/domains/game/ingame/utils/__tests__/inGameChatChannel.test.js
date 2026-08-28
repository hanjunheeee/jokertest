import test from "node:test"
import assert from "node:assert/strict"
import {
  INGAME_CHAT_CHANNELS,
  resolveInGameChatSendChannel,
  resolveInGameChatViewChannel,
} from "../inGameChatChannel.js"

const ME = "me-uuid"
const OTHER = "other-uuid"

/** phase와 본인 생존 여부만 바꿔가며 판정하기 위한 최소 canonical state. */
function buildState({ phase = "DAY", alive = true } = {}) {
  return {
    id: "game-1",
    phase,
    dayIndex: 1,
    players: [
      { uuid: ME, nickname: "Me", alive },
      { uuid: OTHER, nickname: "Other", alive: true },
    ],
    self: { uuid: ME, nickname: "Me", role: "CITIZEN", team: "CITIZEN" },
  }
}

test("생존자 DAY: 보기·전송 모두 DAY다", () => {
  const state = buildState()
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DAY)
  assert.equal(resolveInGameChatSendChannel(state), INGAME_CHAT_CHANNELS.DAY)
})

test("생존자 NIGHT/TRIBUNAL: 공개 DAY 내역은 계속 보지만 보내지는 못한다", () => {
  for (const phase of ["NIGHT", "TRIBUNAL"]) {
    const state = buildState({ phase })
    assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DAY)
    assert.equal(resolveInGameChatSendChannel(state), null)
  }
})

test("사망자 NIGHT: 보기·전송 모두 null이다(밤에는 어떤 채팅도 보거나 보낼 수 없다)", () => {
  const state = buildState({ phase: "NIGHT", alive: false })
  assert.equal(resolveInGameChatViewChannel(state), null)
  assert.equal(resolveInGameChatSendChannel(state), null)
})

test("사망자 DAY/TRIBUNAL: 보기·전송 모두 DEAD로 유지된다", () => {
  for (const phase of ["DAY", "TRIBUNAL"]) {
    const state = buildState({ phase, alive: false })
    assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DEAD)
    assert.equal(resolveInGameChatSendChannel(state), INGAME_CHAT_CHANNELS.DEAD)
  }
})

test("사망자 ROLE_REVEAL: 아직 사망자 채팅이 열리지 않는다", () => {
  const state = buildState({ phase: "ROLE_REVEAL", alive: false })
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DEAD)
  assert.equal(resolveInGameChatSendChannel(state), null)
})

test("생존 여부를 알 수 없으면 보기·전송 모두 null이다(fail-closed)", () => {
  // roster에 self가 없어 canonical alive를 유도할 수 없는 상태.
  const state = { ...buildState({ phase: "NIGHT" }), players: [{ uuid: OTHER, nickname: "Other", alive: true }] }
  assert.equal(resolveInGameChatViewChannel(state), null)
  assert.equal(resolveInGameChatSendChannel(state), null)

  assert.equal(resolveInGameChatViewChannel(null), null)
  assert.equal(resolveInGameChatSendChannel(null), null)
})
