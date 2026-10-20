import test from "node:test"
import assert from "node:assert/strict"
import {
  buildInGameTribunalExpulsionMessage,
  resolveInGameTribunalExpulsionNickname,
} from "../ingameTribunalExpulsionPresentation.js"

test("resolveInGameTribunalExpulsionNickname: roster에서 닉네임을 찾는다", () => {
  const players = [
    { uuid: "u1", nickname: "홍길동" },
    { uuid: "u2", nickname: "김철수" },
  ]
  assert.equal(resolveInGameTribunalExpulsionNickname(players, "u1"), "홍길동")
})

test("buildInGameTribunalExpulsionMessage: 가면무도회 추방 문구", () => {
  assert.equal(
    buildInGameTribunalExpulsionMessage("홍길동"),
    "[홍길동]님이 가면무도회에서 추방당하셨습니다.",
  )
})
