import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)

/**
 * 원격 UI(feature/ui-Phase1complete)의 같은 이름 스위트를 이 저장소의 계약으로 가져왔다.
 *
 * 원격은 밤 판정이 서버 자동 진행이라 "밤 종료" 버튼이 아예 없다고 단언하지만, 이 저장소는
 * 여전히 클라이언트가 resolve_night을 명시적으로 요청한다(useInGameResolveNight). 그래서
 * "밤 컨트롤이 역할 행동을 제출한다"는 원래 계약은 그대로 두고, 밤 판정 컨트롤에 대한 단언만
 * 로컬의 실제 계약(존재하며 resolveNightStatus로 잠긴다)으로 뒤집었다 — 기존 동작을 통과시키려
 * 기대값을 낮춘 게 아니라, 두 브랜치의 계약이 다른 지점을 명시적으로 기록한 것이다.
 */

test("InGameActionPanel production NIGHT control submits the role action", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /onClick=\{submitNightAction\}/)
  // production 삼항 포맷터(prettier 등)가 줄바꿈 위치를 바꿔도 깨지지 않도록 토큰 사이 공백을
  // \s+로 허용한다 — "nightActionLabel이 있으면 `${nightActionLabel} 확정`을 쓴다"는 실제 계약만
  // 검증하고, 그 표현이 한 줄인지 여러 줄인지는 이 회귀 테스트의 관심사가 아니다.
  assert.match(source, /nightActionLabel\s*\?\s*`\$\{nightActionLabel\}\s*확정`/)
  assert.match(source, /onClick=\{skipNightAction\}/)
})

test("이 저장소의 밤 판정은 여전히 클라이언트가 요청한다 — resolveNight 컨트롤이 남아 있고 진행 중에는 잠긴다", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /onClick=\{resolveNight\}/)
  assert.match(source, /disabled=\{resolveNightStatus !== "idle"\}/)
  assert.match(source, /resolveNightError \?/)
})

test("밤 행동 섹션은 사망자·행동 불가 역할에게 대상 선택기 대신 안내 문구만 보여준다", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /nightActionType === null \|\| !nightActionAlive \?/)
  assert.match(source, /이 밤에는 행동할 수 없습니다\./)
})

test("내 차례가 아닐 때는 잠금 사유를 nightTurnRole 한 곳에서만 읽어 안내한다(판정을 두 번 하지 않는다)", async () => {
  const source = await readFile(componentUrl, "utf8")

  assert.match(source, /\{!isNightTurnActor \? \(/)
  assert.match(source, /getInGameNightTurnRoleLabel\(nightTurnRole\)/)
})
