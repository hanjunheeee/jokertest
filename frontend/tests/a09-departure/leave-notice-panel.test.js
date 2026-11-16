// 산 사람 나가기 안내 창 시험(화면 부품): 나가는 중·실패·결과 모름 글과 단추, 사망 글 없음, 돌아가기·다시 시도, 창 읽기 이름·초점·Tab 가둠, 나가는 중 뒤 판 막힘
// 목록 A09-끊김-나가기-탈주.md A09-F-205~214·274, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/leave-notice-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { default: InGameDeadParticipantChoice } = await import("../../src/domains/game/ingame/components/deadChoice/InGameDeadParticipantChoice.jsx")

test.afterEach(() => K.reset())

const LEAVE_DIALOG = "게임 나가기 안내"
const leaveDialog = () => K.dialogNamed(LEAVE_DIALOG)

// 판 화면이 넘기는 값 그대로 산 사람 안내 창만 그림 (누른 것은 calls에 모음)
function drawPanel(exitStatus, exitErrorCode = null) {
  const calls = []
  K.RTL.render(K.h(InGameDeadParticipantChoice, {
    open: true,
    selfDead: false,
    exitStatus,
    exitErrorCode,
    onKeepWatching: () => calls.push("돌아가기"),
    onLeave: () => calls.push("나가기"),
    onRetry: () => calls.push("다시 시도"),
    onResolveOutcome: () => calls.push("결과 확인"),
  }))
  return calls
}

// 판 화면에서 산 사람이 나가기를 눌러 실패까지
async function failedOnPage({ n = 6, me = 1 } = {}) {
  const t = K.seat({ n, me, jokers: [0] })
  await K.renderPage()
  K.dialogs.confirmAnswer = true
  await K.click(K.topExitButton())
  await t.answer("leave_game_session", { ok: false, code: "LEAVE_NOT_ALLOWED" })
  assert.ok(leaveDialog() !== null, "안내 창 없음")
  return t
}

test("A09-F-205 나가는 중(pending) → \"게임에서 나가는 중입니다.\", \"게임으로 돌아가기\" 꺼짐", () => {
  drawPanel("pending")
  const dialog = leaveDialog()
  assert.ok(dialog.textContent.includes("게임에서 나가는 중입니다."))
  assert.equal(K.buttonByText("게임으로 돌아가기", dialog).disabled, true)
})

test("A09-F-206 실패(failed) → \"게임에서 나가지 못했습니다.\" + 안내 글 + \"다시 시도\"", () => {
  drawPanel("failed", "LEAVE_NOT_ALLOWED")
  const dialog = leaveDialog()
  assert.ok(dialog.textContent.includes("게임에서 나가지 못했습니다."))
  assert.ok(dialog.textContent.includes("나가기에 실패했습니다. 다시 시도해 주세요."))
  assert.ok(K.buttonByText("다시 시도", dialog) !== null)
})

test("A09-F-207 결과 모름(unresolved) → \"나가기 결과 확인\" 단추", () => {
  drawPanel("unresolved", "NO_ACK")
  assert.ok(K.buttonByText("나가기 결과 확인", leaveDialog()) !== null)
})

test("A09-F-208 나가는 중·실패·결과 모름 어느 경우든 사망 글 없음", () => {
  for (const [status, code] of [["pending", null], ["failed", "OFFLINE"], ["unresolved", "NO_ACK"]]) {
    drawPanel(status, code)
    const text = leaveDialog().textContent
    assert.equal(text.includes("사망"), false, `${status}: ${text}`)
    K.RTL.cleanup()
  }
})

test("A09-F-209 7명 판 나가기 실패 안내 창 \"게임으로 돌아가기\" → 창 닫힘", async () => {
  await failedOnPage({ n: 7, me: 2 })
  await K.click(K.buttonByText("게임으로 돌아가기", leaveDialog()))
  assert.ok(leaveDialog() === null, "창이 안 닫힘")
})

test("A09-F-210 8명 판 나가기 실패 안내 창 \"다시 시도\" → leave_game_session 다시 보냄", async () => {
  const t = await failedOnPage({ n: 8, me: 3 })
  assert.equal(t.fake.sentOf("leave_game_session").length, 1)
  await K.click(K.buttonByText("다시 시도", leaveDialog()))
  assert.equal(t.fake.sentOf("leave_game_session").length, 2)
  assert.equal(K.dialogs.confirms.length, 1, "다시 시도에 확인 창이 또 뜸")
})

test("A09-F-211 안내 창 role=dialog · aria-modal · 이름 \"게임 나가기 안내\"", () => {
  drawPanel("failed", "OFFLINE")
  const dialog = K.RTL.screen.getByRole("dialog", { name: LEAVE_DIALOG })
  assert.equal(dialog.getAttribute("aria-modal"), "true")
})

test("A09-F-212 실패 안내 글이 role=\"status\" 칸 안", () => {
  drawPanel("failed", "OFFLINE")
  const status = leaveDialog().querySelector('[role="status"]')
  assert.ok(status !== null, "status 칸 없음")
  assert.ok(status.textContent.includes("연결이 끊겨 나가기를 보내지 못했습니다"))
})

test("A09-F-213 안내 창이 열리면 초점이 창 안", async () => {
  drawPanel("failed", "OFFLINE")
  await K.flush()
  assert.ok(leaveDialog().contains(document.activeElement), "초점이 창 밖")
})

test("A09-F-214 안내 창 열린 채 Tab 여러 번 → 초점 늘 창 안 [지금 동작]", async () => {
  // 창 밖에도 누를 수 있는 단추가 있는 화면
  K.RTL.render(K.h("div", null,
    K.h("button", { type: "button" }, "창 밖 단추"),
    K.h(InGameDeadParticipantChoice, { open: true, selfDead: false, exitStatus: "failed", exitErrorCode: "OFFLINE", onKeepWatching() {}, onRetry() {} }),
  ))
  await K.flush()
  for (let i = 0; i < 5; i += 1) {
    await K.pressTab()
    assert.ok(leaveDialog().contains(document.activeElement), `${i + 1}번째 Tab에 초점이 창 밖`)
  }
  await K.pressTab({ shift: true })
  assert.ok(leaveDialog().contains(document.activeElement), "Shift+Tab에 초점이 창 밖")
})

test("A09-F-274 10명 판 나가는 중 안내 창 열림 → 뒤 판(카드·투표 단추) 못 누름", async () => {
  const t = K.seat({ n: 10, me: 4, jokers: [0, 1] })
  await K.renderPage()
  K.dialogs.confirmAnswer = true
  await K.click(K.topExitButton())
  assert.ok(leaveDialog() !== null, "안내 창 없음")
  const card = K.cardButton(t.nick(6))
  assert.ok(card.closest("[inert]") !== null, "카드가 막힌 칸 안에 없음")
  const abstain = document.querySelector('[data-ingame-phase-action="dayVoteAbstain"]')
  assert.ok(abstain === null || abstain.closest("[inert]") !== null, "기권 단추가 안 막힘")
})
