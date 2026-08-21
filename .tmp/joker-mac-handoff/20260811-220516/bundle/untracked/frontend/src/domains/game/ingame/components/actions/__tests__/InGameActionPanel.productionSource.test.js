import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)

test("InGameActionPanel production NIGHT control submits the role action and exposes no ordinary 밤 종료 resolver", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /onClick=\{submitNightAction\}/)
  // production 삼항 포맷터(prettier 등)가 줄바꿈 위치를 바꿔도 깨지지 않도록 토큰 사이 공백을
  // \s+로 허용한다 — "nightActionLabel이 있으면 `${nightActionLabel} 확정`을 쓴다"는 실제 계약만
  // 검증하고, 그 표현이 한 줄인지 여러 줄인지는 이 회귀 테스트의 관심사가 아니다.
  assert.match(source, /nightActionLabel\s*\?\s*`\$\{nightActionLabel\}\s*확정`/)
  assert.doesNotMatch(source, /onClick=\{resolveNight\}/)
  assert.doesNotMatch(source, /"밤 종료"/)
  assert.doesNotMatch(source, /resolveNightStatus/)
  assert.doesNotMatch(source, /resolveNightError/)
})
