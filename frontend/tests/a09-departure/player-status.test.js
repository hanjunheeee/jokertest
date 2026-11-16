// 카드 상태 정하기 표 시험(화면 상태): (판에서 빠짐 · 생존 · 연결) 8가지 → 사망·끊김·생존
// 목록 A09-끊김-나가기-탈주.md A09-F-080~087, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/player-status.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { mergeSourcePlayerWithPreview } = await import("../../src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js")

// 규칙: 빠진 죽은 사람 = 사망 / 그 밖 연결 없음 = 끊김 / 연결·산 = 생존 / 연결·죽음 = 사망
function expected({ left, alive, connected }) {
  if (left && !alive) return "dead"
  if (!connected) return "disconnected"
  return alive ? "alive" : "dead"
}

const yesNo = (v) => (v ? "예" : "아니오")
let no = 80
for (const left of [true, false]) {
  for (const alive of [true, false]) {
    for (const connected of [true, false]) {
      const id = `A09-F-${String(no).padStart(3, "0")}`
      no += 1
      const want = expected({ left, alive, connected })
      test(`${id} 빠짐 ${yesNo(left)} · 생존 ${yesNo(alive)} · 연결 ${yesNo(connected)} → 카드 ${want}`, () => {
        const source = { id: "u1", name: "여름", alive, connected, themeIndex: 0, ...(left ? { left: true } : {}) }
        assert.equal(mergeSourcePlayerWithPreview(source, {}).status, want)
      })
    }
  }
}
