// 직업별 낮 화면: 낮엔 직업 능력 단추가 없고 표 고르기는 누구나 같은지 화면 부품 시험
// 목록 A03-낮투표.md 번호 A03-F-214~228
import test from "node:test"
import assert from "node:assert/strict"
import {
  ROLE_LABELS, buttons, fakeSocket, fire, readCardMenu, renderPage, resetAll, seat, settle,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 밤 능력 이름 (카드 메뉴·구석 단추에 뜨면 안 됨)
const ABILITY_NAMES = ["암살", "보호", "조사", "확인", "밤 행동", "취소하기", "건너뛰기"]
const ROLES = ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]
const STAGES = [
  ["토론", { dayPhase: "DAY_DISCUSSION" }],
  ["투표", { dayPhase: "DAY_VOTE" }],
  ["5초 중", { dayPhase: "DAY_VOTE", pulled: true }],
]
// 직업마다 같은 직업 동료 하나 (시민 빼고), 2일 낮이라 마녀사냥꾼 능력도 열린 날
const alliesOf = (role) => (role === "CITIZEN" ? undefined : [4])

let no = 214
for (const role of ROLES) {
  for (const [stageName, stage] of STAGES) {
    const id = `A03-F-${no}`
    no += 1
    test(`${id} 내 직업 ${ROLE_LABELS[role]} · ${stageName} → 직업 능력 단추 없음, 표 고르기는 같음`, async () => {
      const { pulled, ...stageOptions } = stage
      const socket = fakeSocket()
      seat({ n: 6, role, allies: alliesOf(role), phase: "DAY", dayIndex: 2, ...stageOptions })
      await renderPage(socket)
      if (pulled) await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000, dayIndex: 2 }))

      // 구석·행동 줄 단추에 능력 이름 없음
      const pageNames = buttons().map((b) => b.getAttribute("aria-label") ?? b.textContent.trim())
      assert.equal(pageNames.some((name) => ABILITY_NAMES.includes(name)), false, pageNames.join(" | "))

      // 다른 사람 카드(같은 직업 동료 포함)·내 카드 메뉴에 능력 항목 없음, 투표 단계면 누를 수 있는 '투표하기'
      for (const index of [0, 2, 4]) {
        const items = await readCardMenu(index)
        assert.equal(items.some((item) => ABILITY_NAMES.includes(item.name)), false, `${index}번 카드: ${items.map((i) => i.name)}`)
        if (index === 0) continue
        const canVote = items.some((item) => item.name === "투표하기" && item.enabled)
        assert.equal(canVote, stageName !== "토론", `${index}번 카드 투표 항목`)
      }
      if (stageName === "토론") {
        assert.equal(document.querySelector('[data-ingame-phase-action="dayReady"]')?.textContent, "투표 시작 준비")
      }
    })
  }
}
