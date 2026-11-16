// "낮 집계" 단추가 어느 단계·어느 사람 화면에도 없는지 화면 부품 시험 (판정은 다 내면 5초 뒤 서버가 함)
// 목록 A03-낮투표.md 번호 A03-F-142~153
import test from "node:test"
import assert from "node:assert/strict"
import { buttons, fakeSocket, fire, renderPage, resetAll, seat, settle, uuidOf } from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 단계마다 판 차리기 (6명 판, 나는 0번)
const PHASES = [
  ["역할 공개", { phase: "ROLE_REVEAL", dayIndex: 0 }],
  ["토론", { phase: "DAY", dayPhase: "DAY_DISCUSSION" }],
  ["투표", { phase: "DAY", dayPhase: "DAY_VOTE" }],
  ["투표 5초 중", { phase: "DAY", dayPhase: "DAY_VOTE", pulled: true }],
  ["재판", { phase: "TRIBUNAL", state: { tribunal: { defendantUuid: uuidOf(3), resolved: false } } }],
  ["밤", { phase: "NIGHT" }],
]

let no = 142
for (const [phaseName, options] of PHASES) {
  for (const alive of [true, false]) {
    const id = `A03-F-${no}`
    no += 1
    test(`${id} ${phaseName} · ${alive ? "산" : "죽은"} 나 → '낮 집계' 단추 없음`, async () => {
      const { pulled, ...seatOptions } = options
      const socket = fakeSocket()
      seat({ n: 6, ...seatOptions, dead: alive ? [] : [0] })
      await renderPage(socket)
      if (pulled) await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
      const names = buttons().map((b) => `${b.getAttribute("aria-label") ?? ""} ${b.textContent}`)
      assert.ok(names.length > 0, "화면에 단추가 그려짐")
      assert.equal(names.some((name) => /집계/.test(name)), false, `집계 단추가 있음: ${names.join(" | ")}`)
      assert.equal(document.querySelector('[data-ingame-phase-action="dayResolve"]') === null, true)
    })
  }
}
