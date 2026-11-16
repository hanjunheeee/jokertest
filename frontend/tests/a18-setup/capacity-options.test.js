// 화면 상태 시험: 방 만들기 설정 표의 최대 인원·광대 칸이 운영 규칙(5~10명, 처음 10, 광대 최소 1) — 개발 빌드 값으로 불러도 같음
// 목록 A18-F-030 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-setup/capacity-options.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"

// 개발 빌드 값(DEV 참)을 먼저 켜고, 시험 대상은 그 뒤 불러옴
register(new URL("./devEnvLoaderHooks.mjs", import.meta.url))

const { GENERAL_GAME_SETUP } = await import("../../src/domains/game/setup/constants/gameSetupOptions.js")
const { buildDefaultFormState } = await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const { readInGameTimerPlacement } = await import("../../src/domains/game/ingame/constants/timebar/ingameTimerPlacement.js")

const itemOf = (id) => GENERAL_GAME_SETUP.find((item) => item.id === id)

test("A18-F-030 [단위 18] 개발 빌드 값으로 불러도 방 만들기 최대 인원 5~10(처음 10), 광대 최소 1", () => {
  // 개발 빌드 값이 정말 켜졌는지 먼저 봄 (개발일 때만 "채팅" 자리를 고르는 코드로 확인)
  assert.equal(readInGameTimerPlacement({ search: "", storage: null }), "chat")

  const max = itemOf("max-players")
  assert.deepEqual([max.min, max.max, max.defaultValue], [5, 10, 10])
  assert.equal(itemOf("joker-count").min, 1)

  const form = buildDefaultFormState()
  assert.equal(form.ranges["max-players"], 10)
  assert.ok(form.ranges["joker-count"] >= 1)
})
