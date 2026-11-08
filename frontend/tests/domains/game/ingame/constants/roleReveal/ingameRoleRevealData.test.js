// 마녀사냥꾼 설명: 처형 삭제 뒤 죽은 사람 역할 확인만 (사용자 결정 2026-11-09)
import test from "node:test"
import assert from "node:assert/strict"
import { getRoleRevealDisplay } from "../../../../../../src/domains/game/ingame/constants/roleReveal/ingameRoleRevealData.js"

test("마녀사냥꾼 설명은 죽은 사람 역할 확인만 말하고 처형·광대 여부 판별은 말하지 않음", () => {
  const { description } = getRoleRevealDisplay("WITCH_HUNTER")
  assert.match(description, /죽은/)
  assert.match(description, /역할/)
  assert.doesNotMatch(description, /처형|광대인지/)
})
