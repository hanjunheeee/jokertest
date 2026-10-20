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
function buildState({ phase = "DAY", alive = true, role = "CITIZEN" } = {}) {
  return {
    id: "game-1",
    phase,
    dayIndex: 1,
    players: [
      { uuid: ME, nickname: "Me", alive },
      { uuid: OTHER, nickname: "Other", alive: true },
    ],
    self: { uuid: ME, nickname: "Me", role, team: role === "JOKER" ? "JOKER" : "CITIZEN" },
  }
}

test("생존자 DAY: 보기·전송 모두 DAY다", () => {
  const state = buildState()
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DAY)
  assert.equal(resolveInGameChatSendChannel(state), INGAME_CHAT_CHANNELS.DAY)
})

test("생존자 NIGHT: 모든 역할이 자기 역할 채널만 보고 보낸다", () => {
  for (const role of ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    const state = buildState({ phase: "NIGHT", role })
    assert.equal(resolveInGameChatViewChannel(state), role)
    assert.equal(resolveInGameChatSendChannel(state), role)
  }
})

test("생존자 TRIBUNAL: DAY 내역을 보며 최후의 반론 중에도 DAY로 보낼 수 있다", () => {
  const state = buildState({ phase: "TRIBUNAL" })
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DAY)
  assert.equal(resolveInGameChatSendChannel(state), INGAME_CHAT_CHANNELS.DAY)
})

test("사망자 NIGHT: 보기·전송 모두 null이다(밤에는 어떤 채팅도 보거나 보낼 수 없다)", () => {
  const state = buildState({ phase: "NIGHT", alive: false })
  assert.equal(resolveInGameChatViewChannel(state), null)
  assert.equal(resolveInGameChatSendChannel(state), null)
})

test("사망한 JOKER의 NIGHT만 JOKER 보기·전송이 허용된다", () => {
  const state = buildState({ phase: "NIGHT", alive: false, role: "JOKER" })
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.JOKER)
  assert.equal(resolveInGameChatSendChannel(state), INGAME_CHAT_CHANNELS.JOKER)
})

test("사망자 DAY: DAY를 열람하지만 전송은 할 수 없다", () => {
  const state = buildState({ phase: "DAY", alive: false })
  assert.equal(resolveInGameChatViewChannel(state), INGAME_CHAT_CHANNELS.DAY)
  assert.equal(resolveInGameChatSendChannel(state), null)
})

test("사망자 TRIBUNAL/ROLE_REVEAL: 채팅이 열리지 않는다", () => {
  for (const phase of ["TRIBUNAL", "ROLE_REVEAL"]) {
    const state = buildState({ phase, alive: false })
    assert.equal(resolveInGameChatViewChannel(state), null)
    assert.equal(resolveInGameChatSendChannel(state), null)
  }
})

test("생존 여부를 알 수 없으면 보기·전송 모두 null이다(fail-closed)", () => {
  // roster에 self가 없어 canonical alive를 유도할 수 없는 상태.
  const state = { ...buildState({ phase: "NIGHT" }), players: [{ uuid: OTHER, nickname: "Other", alive: true }] }
  assert.equal(resolveInGameChatViewChannel(state), null)
  assert.equal(resolveInGameChatSendChannel(state), null)

  assert.equal(resolveInGameChatViewChannel(null), null)
  assert.equal(resolveInGameChatSendChannel(null), null)
})
