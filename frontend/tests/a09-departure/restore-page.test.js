// 다시 붙은 뒤 판 화면 시험(화면 부품, 판 화면 전체): 남은 초·내 직업·동료·표 낸 뒤 투표 단추·재판 창·내 밤 차례 고르기·사망 창, 새로고침 뒤 채팅 기록
// 목록 A09-끊김-나가기-탈주.md A09-F-244~250·276, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/restore-page.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { saveChatHistory } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(() => K.reset())

// 판 화면을 그린 채 끊겼다 붙어 over 스냅샷을 받음
async function reconnectPage(t, over = {}) {
  await K.renderPage()
  await K.reconnectWith(t, t.snapshot(over))
  await K.flush()
}

// 시간 바를 펼쳐 남은 시간 글 (MM:SS)
async function timerText() {
  const expand = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "시간흐름바 확대")
  if (expand) await K.click(expand)
  const timebar = document.querySelector('[aria-label$="시간 흐름"]')
  return timebar?.querySelector('[role="timer"]')?.textContent ?? null
}

// "내 역할 보기" 창 글
async function roleDialogText() {
  await K.click(document.querySelector('button[aria-label="내 역할 보기"]'))
  return K.RTL.screen.getByRole("dialog", { name: "내 역할 보기" }).textContent
}

test("A09-F-244 7명 판 투표 마감 30초 남은 스냅샷으로 다시 붙음 → 시간 바 남은 초 00:30", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], dayPhase: "DAY_DISCUSSION" })
  K.useFakeClock()
  t.dayPhase = "DAY_VOTE"
  await reconnectPage(t, { dayPhase: "DAY_VOTE", dayPhaseDeadline: Date.now() + 30_000 })
  const text = await timerText()
  mock.timers.reset()
  assert.equal(text, "00:30")
})

test("A09-F-245 8명 판 의사가 다시 붙음 → 내 역할 창에 직업 \"의사\"", async () => {
  const t = K.seat({ n: 8, me: 2, jokers: [0, 1], roles: { 2: "DOCTOR", 5: "DOCTOR" } })
  await reconnectPage(t)
  const text = await roleDialogText()
  assert.ok(text.includes("의사"), text)
})

test("A09-F-246 8명 판 의사 2명 중 하나가 다시 붙음 → 동료 의사 표시(동료 닉네임)", async () => {
  const t = K.seat({ n: 8, me: 2, jokers: [0, 1], roles: { 2: "DOCTOR", 5: "DOCTOR" } })
  await reconnectPage(t)
  const text = await roleDialogText()
  assert.ok(text.includes("동료 의사"), text)
  assert.ok(text.includes(t.nick(5)), text)
})

test("A09-F-247 6명 판 3번에 표 낸 뒤 다시 붙음 → 기권 단추 꺼짐, 3번 카드엔 \"투표하기\" 대신 \"투표취소\"", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  await reconnectPage(t, { self: { hasSubmittedDayVote: true, dayVoteTargetUuid: t.uuid(3), dayVoteRound: 1 } })
  await K.dismissOverlays()
  const abstain = document.querySelector('[data-ingame-phase-action="dayVoteAbstain"]')
  assert.ok(abstain !== null, "기권 단추 없음")
  assert.equal(abstain.disabled, true)
  const items = await K.cardMenuButtons(t.nick(3))
  assert.ok(items.some((i) => i.label === "투표취소"), JSON.stringify(items))
  assert.equal(items.some((i) => i.label === "투표하기"), false)
})

test("A09-F-248 7명 판 끊긴 동안 재판 열림 → 다시 붙음 → 재판 창(피고 닉네임)", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  t.phase = "TRIBUNAL"
  t.defendant = 4
  await reconnectPage(t)
  const dialog = K.RTL.screen.queryByRole("dialog", { name: "재판" })
  assert.ok(dialog !== null, "재판 창 없음")
  assert.ok(dialog.textContent.includes(t.nick(4)), dialog.textContent)
})

test("A09-F-249 10명 판 내 밤 차례(의사)에 다시 붙음 → 산 사람 카드 메뉴에서 \"보호\" 고를 수 있음·건너뛰기 단추", async () => {
  const t = K.seat({ n: 10, me: 2, jokers: [0, 1], roles: { 2: "DOCTOR" } })
  t.phase = "NIGHT"
  await reconnectPage(t, { phase: "NIGHT", nightTurnRole: "DOCTOR", nightTurnDeadline: Date.now() + 30_000 })
  await K.dismissOverlays()
  assert.ok(document.querySelector('[data-ingame-phase-action="nightSkip"]') !== null, "건너뛰기 단추 없음")
  const items = await K.cardMenuButtons(t.nick(6))
  assert.ok(items.some((i) => i.label === "보호" && i.enabled), JSON.stringify(items))
})

test("A09-F-250 6명 판 끊긴 동안 내가 죽음 → 다시 붙음 → 사망 창", async () => {
  const t = K.seat({ n: 6, me: 3, jokers: [0] })
  t.seats[3].alive = false
  await reconnectPage(t)
  assert.ok(K.dialogNamed("사망 후 선택") !== null, "사망 창 없음")
})

test("A09-F-276 5명 판 채팅 3줄 저장 + 새로고침 → 채팅 칸에 3줄", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0], bootstrap: false })
  const lines = ["안녕하세요 다들", "누가 수상해요", "저는 시민입니다"]
  saveChatHistory("game", t.gameId, t.me, {
    DAY: lines.map((text, i) => ({ id: `c${i}`, senderUuid: t.uuid(i + 2), text, sentAt: Date.now() - 10_000 + i })),
    DEAD: [],
  })
  await K.renderPage()
  await t.answer("get_session_snapshot", t.snapshot())
  await K.flush()
  await K.waitUntil(() => document.querySelectorAll("[data-ingame-player-nickname]").length === 5, { what: "판 화면" })
  for (const line of lines) assert.ok(document.body.textContent.includes(line), `채팅 줄 없음: ${line}`)
})
