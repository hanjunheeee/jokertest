// 토론 "투표 시작 준비" 단추(글·누름·꺼짐·키보드·읽히는 이름) 화면 부품 시험 — 인게임 화면을 그려 봄
// 목록 A03-낮투표.md 번호 A03-F-154~165, 244 (⑩은 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, buttonByName, click, closeDawnReport, dayPhaseChanged, dayResolved, deferred, fakeSocket, fire, firstDay, flush,
  isTabReachable, loginOnly, menuItems, cardOf, nextDay, pressEnter, renderPage, resetAll, rtl, seat, snapshot, useInGameStore,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const readyButton = () => document.querySelector('[data-ingame-phase-action="dayReady"]')

// 6명 판 1일 토론 화면
async function discussionPage({ acks = {}, ...seatOptions } = {}) {
  const socket = fakeSocket({ acks })
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", ...seatOptions })
  await renderPage(socket)
  return socket
}
// 역할 공개 → 첫 낮 알림 ("낮이 되었습니다" 창이 뜸)
async function firstDayPage() {
  const socket = fakeSocket()
  seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
  await renderPage(socket)
  await fire(socket, "game_phase_changed", firstDay({ deadline: Date.now() + 60_000 }))
  return socket
}

test("A03-F-154 ① 토론 중 단추 글 '투표 시작 준비'", async () => {
  await discussionPage()
  assert.equal(readyButton()?.textContent, "투표 시작 준비")
  assert.equal(readyButton().disabled, false)
})

test("A03-F-155 ② 누르면 '준비 중...'", async () => {
  const ack = deferred()
  await discussionPage({ acks: { ready_for_day_vote: () => ack.promise } })
  await click(readyButton())
  assert.equal(readyButton().textContent, "준비 중...")
})

test("A03-F-156 ③ 답 받은 뒤 '준비 완료'", async () => {
  const ack = deferred()
  await discussionPage({ acks: { ready_for_day_vote: () => ack.promise } })
  await click(readyButton())
  ack.resolve({ ok: true, readyCount: 2, requiredCount: 6 })
  await flush()
  assert.equal(readyButton().textContent, "준비 완료")
})

test("A03-F-157 ④ 토론 중 안내 '토론 중입니다. 투표는 아직 열리지 않았습니다.'", async () => {
  await discussionPage()
  await click(cardOf(2))
  const item = menuItems().find((entry) => entry.name === "투표하기")
  assert.ok(item, "카드 메뉴에 투표 항목이 보임")
  assert.equal(item.enabled, false)
  assert.equal(item.el.getAttribute("title"), "토론 중입니다. 투표는 아직 열리지 않았습니다.")
  assert.match(item.el.textContent, /토론 중입니다\. 투표는 아직 열리지 않았습니다\./)
})

test("A03-F-158 ⑤ 투표 단계 → 준비 단추 없음", async () => {
  const socket = await discussionPage()
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  assert.equal(readyButton() === null, true)
})

test("A03-F-159 ⑥ 죽은 사람 → 준비 단추 없음", async () => {
  await discussionPage({ dead: [0] })
  assert.equal(readyButton() === null, true, `죽은 사람 화면에 준비 단추가 있음 (꺼짐: ${readyButton()?.disabled})`)
})

test("A03-F-160 ⑦ '낮이 되었습니다' 창 동안 꺼짐", async () => {
  await firstDayPage()
  assert.ok(document.querySelector("[data-ingame-phase-entrance]"))
  assert.equal(readyButton().disabled, true)
})

test("A03-F-161 ⑧ 창 닫으면 켜짐", async () => {
  await firstDayPage()
  await click(buttonByName("확인"))
  assert.equal(readyButton().disabled, false)
})

test("A03-F-162 ⑨ 2일 토론에 다시 '투표 시작 준비'", async () => {
  const socket = await discussionPage()
  await click(readyButton())
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  await click(buttonByName("확인"))
  assert.equal(readyButton()?.textContent, "투표 시작 준비")
  assert.equal(readyButton().disabled, false)
})

test("A03-F-163 ⑩ 실패 뒤 다시 누름 [지금 동작]", async () => {
  let call = 0
  const socket = await discussionPage({
    acks: { ready_for_day_vote: () => (++call === 1 ? { ok: false, message: "잠시 후 다시 시도해 주세요." } : { ok: true }) },
  })
  await click(readyButton())
  assert.equal(readyButton().textContent, "투표 시작 준비")
  await click(readyButton())
  assert.equal(readyButton().textContent, "준비 완료")
  assert.equal(socket.sentOf("ready_for_day_vote").length, 2)
})

test("A03-F-164 ⑪ 키보드(Tab으로 닿고 Enter)로 누름", async () => {
  const socket = await discussionPage()
  assert.equal(isTabReachable(readyButton()), true)
  await pressEnter(readyButton())
  assert.deepEqual(socket.sentOf("ready_for_day_vote"), [{ gameId: GAME }])
  assert.equal(readyButton().textContent, "준비 완료")
})

test("A03-F-165 ⑫ 단추 이름이 읽힘(접근 이름 '투표 시작 준비')", async () => {
  await discussionPage()
  const found = rtl.screen.getByRole("button", { name: "투표 시작 준비" })
  assert.equal(found === readyButton(), true)
})

// C-025를 고치며 생길 수 있는 되돌이: 스냅샷의 1일 준비 기록이 2일 토론에 남아 단추가 "준비 완료"로 잠기면 안 됨
test("A03-F-244 6명 판: 1일 토론 중 새로고침(내 준비 기록 참) → '준비 완료', 2일 토론이 되면 다시 '투표 시작 준비'로 켜짐", async () => {
  loginOnly()
  const socket = fakeSocket({
    acks: { get_session_snapshot: snapshot({ dayPhase: "DAY_DISCUSSION", extra: { dayPhaseDeadline: Date.now() + 60_000 }, self: { isDayVoteReady: true } }) },
  })
  await renderPage(socket)
  assert.equal(readyButton()?.textContent, "준비 완료")
  assert.equal(readyButton().disabled, true)
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  if (buttonByName("확인")) await click(buttonByName("확인"))
  assert.equal(useInGameStore.getState().state.dayIndex, 2, "2일로 못 감 (준비 잘못)")
  assert.equal(readyButton()?.textContent, "투표 시작 준비")
  assert.equal(readyButton().disabled, false)
})
