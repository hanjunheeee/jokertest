// 화면 부품 시험: 점검 큰 안내 창·위쪽 띠 — 예약·점검 중·강제 종료(판·방) 글, 닫으면 띠, 띠 누르면 다시, "로비로 가기", 초점, 취소면 띠 사라짐
// 목록 A18-F-201~209 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-maintenance/notice-view.test.js

// 색·가려짐은 jsdom이 못 봐서 브라우저 시험 몫
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const M = await import("./maintenanceKit.mjs")
const { MIN, RTL } = M

test.afterEach(() => M.resetAll())

const T0 = Date.parse("2026-11-10T05:00:00Z")
const STARTS = Date.parse("2026-11-10T06:00:00Z")
const ENDS = Date.parse("2026-11-10T08:00:00Z")

function open(t) {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: T0 })
  t.after(() => t.mock.timers.reset())
  return M.renderNotice()
}

async function scheduled(t) {
  const view = open(t)
  await M.serverSays(view.socket, "maintenance_notice", M.noticeOf({ startsAt: STARTS, serverNow: T0 }))
  return view
}

test("A18-F-201 예약 → alertdialog 안에 \"점검 예정이에요\"·점검 시각·\"점검까지 남은 시간\"·강제 종료 줄·\"확인했어요\" 단추", async (t) => {
  await scheduled(t)
  const dialog = M.bigNotice()
  assert.ok(dialog)
  const text = dialog.textContent
  assert.ok(text.includes("점검 예정이에요"))
  assert.ok(text.includes("11월 10일 오후 3:00"), "점검 시각")
  assert.ok(text.includes("점검까지 남은 시간"))
  assert.ok(text.includes("1시간 00분 00초"), "남은 시간 숫자")
  assert.ok(text.includes("시각이 되면 진행 중 판이 강제로 끝나요."))
  assert.ok(RTL.within(dialog).getByRole("button", { name: "확인했어요" }))
})

test("A18-F-202 \"확인했어요\" 누름 → 큰 안내 없음, region \"점검 안내\"에 \"점검까지 …\"", async (t) => {
  await scheduled(t)
  await M.press("확인했어요")
  assert.equal(M.bigNotice() === null, true)
  assert.ok(M.band())
  assert.ok(M.band().textContent.includes("점검까지 1시간 00분 00초"))
})

test("A18-F-203 띠 누름 → 큰 안내 다시 열림", async (t) => {
  await scheduled(t)
  await M.press("확인했어요")
  await RTL.act(async () => { RTL.fireEvent.click(RTL.within(M.band()).getByRole("button")) })
  await M.flush()
  assert.ok(M.bigNotice())
  assert.ok(M.bigNotice().textContent.includes("점검 예정이에요"))
})

test("A18-F-204 점검 중(끝 시각 있음) → \"지금 점검 중이에요\", 끝 예정 시각 글", async (t) => {
  const view = open(t)
  await M.serverSays(view.socket, "maintenance_notice", M.noticeOf({ state: "active", startsAt: T0 - MIN, endsAt: ENDS, serverNow: T0 }))
  const text = M.bigNotice().textContent
  assert.ok(text.includes("지금 점검 중이에요"))
  assert.ok(text.includes("11월 10일 오후 5:00쯤 끝날 예정이에요."))
})

test("A18-F-205 점검으로 판 끝남 → \"점검으로 판이 끝났어요\"·\"승패 없이 끝났어요. 보상과 벌점도 없어요.\"·\"로비로 가기\"", async () => {
  const view = M.renderNotice()
  await M.serverSays(view.socket, "game_ended", { gameId: "g1", reason: "MAINTENANCE" })
  const dialog = M.bigNotice()
  assert.ok(dialog.textContent.includes("점검으로 판이 끝났어요"))
  assert.ok(dialog.textContent.includes("승패 없이 끝났어요. 보상과 벌점도 없어요."))
  assert.ok(RTL.within(dialog).getByRole("button", { name: "로비로 가기" }))
})

test("A18-F-206 점검으로 대기방 닫힘 → \"점검으로 대기방이 닫혔어요\"·\"점검이 끝나면 다시 방을 만들어 주세요.\"", async () => {
  const view = M.renderNotice({ start: "/game-matching" })
  await M.serverSays(view.socket, "room_deleted", { roomId: "r1", code: "MAINTENANCE" })
  const text = M.bigNotice().textContent
  assert.ok(text.includes("점검으로 대기방이 닫혔어요"))
  assert.ok(text.includes("점검이 끝나면 다시 방을 만들어 주세요."))
})

test("A18-F-207 강제 종료 안내에서 \"로비로 가기\" → 주소 /lobby, 안내 닫힘", async () => {
  const view = M.renderNotice()
  await M.serverSays(view.socket, "game_ended", { gameId: "g1", reason: "MAINTENANCE" })
  await M.press("로비로 가기")
  assert.equal(view.path(), "/lobby")
  assert.equal(M.bigNotice() === null, true)
})

test("A18-F-208 큰 안내 열림 → 초점이 안내 안 단추, Tab이 안내 밖으로 안 나감", async (t) => {
  await scheduled(t)
  const dialog = M.bigNotice()
  const button = RTL.within(dialog).getByRole("button", { name: "확인했어요" })
  assert.ok(document.activeElement === button, "초점이 안내 단추")
  // jsdom은 Tab으로 초점을 안 옮겨서, 안내가 Tab 기본 동작을 막았는지(=밖으로 못 나감)와 초점 자리를 같이 봄
  assert.equal(RTL.fireEvent.keyDown(button, { key: "Tab" }), false, "Tab 기본 동작 막힘")
  assert.ok(dialog.contains(document.activeElement), "Tab 뒤에도 안내 안")
  assert.equal(RTL.fireEvent.keyDown(button, { key: "Tab", shiftKey: true }), false, "Shift+Tab 기본 동작 막힘")
  assert.ok(dialog.contains(document.activeElement), "Shift+Tab 뒤에도 안내 안")
})

test("A18-F-209 띠가 보이는 중 cleared → 띠 없음", async (t) => {
  const view = await scheduled(t)
  await M.press("확인했어요")
  assert.ok(M.band())
  await M.serverSays(view.socket, "maintenance_notice", M.noticeOf({ state: "cleared", serverNow: T0 }))
  assert.equal(M.band() === null, true)
  assert.equal(M.bigNotice() === null, true)
})
