// 나가기 상태별 안내 글 시험(화면 상태): 나가는 중·실패(연결 없음·아직 남음·그 밖)·결과 모름·평소
// 목록 A09-끊김-나가기-탈주.md A09-F-039~044, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/exit-status.test.js
import test from "node:test"
import assert from "node:assert/strict"

const { selectExitStatusNotice } = await import("../../src/domains/game/ingame/utils/exitConfirm.js")

// 상태·오류 코드 → 기대 글 (글 끝 "…"는 앞부분만 맞춰 봄)
const CASES = [
  ["A09-F-039", "pending", null, "나가는 중입니다…", "exact"],
  ["A09-F-040", "failed", "OFFLINE", "연결이 끊겨 나가기를 보내지 못했습니다. 다시 시도해 주세요.", "exact"],
  ["A09-F-041", "failed", "STILL_PARTICIPATING", "아직 이 게임에 남아 있습니다", "prefix"],
  ["A09-F-042", "failed", "SOMETHING_ELSE", "나가기에 실패했습니다. 다시 시도해 주세요.", "exact"],
  ["A09-F-043", "unresolved", "NO_ACK", "나가기 결과를 확인하지 못했습니다", "prefix"],
  ["A09-F-044", "idle", null, null, "exact"],
]

for (const [id, status, code, expected, mode] of CASES) {
  test(`${id} 상태 ${status}${code ? `+${code}` : ""} → ${expected === null ? "안내 없음" : `"${expected}${mode === "prefix" ? "…" : ""}"`}`, () => {
    const notice = selectExitStatusNotice(status, code)
    if (mode === "exact") assert.equal(notice, expected)
    else assert.ok(typeof notice === "string" && notice.startsWith(expected), `받은 글: ${notice}`)
  })
}
