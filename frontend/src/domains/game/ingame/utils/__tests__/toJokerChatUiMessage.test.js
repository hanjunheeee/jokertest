import test from "node:test"
import assert from "node:assert/strict"
import { toJokerChatUiMessage } from "../toJokerChatUiMessage.js"

const networkMessage = { id: "msg-1", senderUuid: "uuid-1", text: "hello", sentAt: 1000 }

test("toJokerChatUiMessage: getPlayerById가 참가자 객체를 반환하면 정확히 5개 키를 갖는 UI 메시지를 반환한다", () => {
  const getPlayerById = (uuid) => (uuid === "uuid-1" ? { nickname: "닉네임" } : null)
  const ui = toJokerChatUiMessage(networkMessage, getPlayerById)
  assert.deepEqual(ui, { id: "msg-1", playerId: "uuid-1", senderName: "닉네임", text: "hello", sentAt: 1000 })
})

test("toJokerChatUiMessage: getPlayerById가 null/undefined를 반환하면 메시지가 폐기된다(null 반환)", () => {
  assert.equal(toJokerChatUiMessage(networkMessage, () => null), null)
  assert.equal(toJokerChatUiMessage(networkMessage, () => undefined), null)
})

test("toJokerChatUiMessage: 참가자 객체에 추가 필드가 있어도 반환 객체에는 새지 않는다(정확히 5키)", () => {
  const getPlayerById = () => ({ nickname: "닉네임", role: "JOKER", team: "JOKER", isAlly: true, theme: "red" })
  const ui = toJokerChatUiMessage(networkMessage, getPlayerById)
  assert.deepEqual(Object.keys(ui).sort(), ["id", "playerId", "senderName", "sentAt", "text"])
})

test("toJokerChatUiMessage: getPlayerById 자체가 없어도 예외 없이 null을 반환한다", () => {
  assert.equal(toJokerChatUiMessage(networkMessage, undefined), null)
})
