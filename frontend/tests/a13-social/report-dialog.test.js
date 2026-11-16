// 신고 창 부품 시험 (창 모양·보냄 성공·중복이면 신고됨·보내는 중·판 안 전적 목록과 결과 목록의 신고 단추)
// 목록 A13-F-230~235 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/report-dialog.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, act, within } = await import("@testing-library/react")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { default: PlayerRecordListContent } = await import("../../src/domains/game/ingame/components/controls/playerRecordList/PlayerRecordListContent.jsx")
const { default: GameResultPlayerList } = await import("../../src/domains/game/result/components/GameResultPlayerList.jsx")
const { installFetch, signIn, resetAll, settle, press, HOLD } = await import("./a13Kit.mjs")

const h = React.createElement
test.afterEach(() => { resetAll(); useInGameStore.getState().clearGame() })

// 판 id·사람 uuid (서버처럼 uuid 모양), 0번이 나
const GAME = "6f1c2d3e-0000-4000-8000-00000000a013"
const NAMES = ["가람", "나래", "다솜", "라온", "마루", "바다"]
const uuidOf = (i) => `a1b2c3d4-0000-4000-8000-00000000000${i}`
const SELF = uuidOf(0)

// 지금 판에 앉힘 (판 id·나·명단 n명)
function seat(n = 5) {
  signIn(SELF, NAMES[0])
  const players = NAMES.slice(0, n).map((nickname, i) => ({ uuid: uuidOf(i), nickname, isAlive: true, isConnected: true, isParticipating: true, themeIndex: i }))
  useInGameStore.getState().setGamePayload({ gameId: GAME, state: { id: GAME, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION", players, self: { uuid: SELF, nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN" } } })
}

// 결과 화면 참가자 목록 (n명)
async function resultList(n, routes = {}) {
  seat()
  const http = installFetch(routes)
  const players = NAMES.slice(0, n).map((name, i) => ({ id: uuidOf(i), name, job: "시민" }))
  await act(async () => { render(h(GameResultPlayerList, { players, selfUuid: SELF })); await settle() })
  return http
}

const rowButtons = () => screen.queryAllByTestId("report-row-button")

// 나래 줄 신고 단추 눌러 창 열기
async function openFor(name = "나래") {
  await press(screen.getByRole("button", { name: `${name} 신고` }))
  return screen.getByRole("dialog", { name: "플레이어 신고" })
}

test("A13-F-230 신고 창 열기 → 제목 \"플레이어 신고\", 사유 4개, 메모 칸, \"신고하기\"·\"취소\"", async () => {
  await resultList(5)
  const dialog = await openFor()
  assert.ok(within(dialog).getByRole("heading", { name: "플레이어 신고" }))
  assert.deepEqual(within(dialog).getAllByRole("radio").map((r) => r.textContent), ["욕설", "비매너", "부정행위", "기타"])
  assert.ok(within(dialog).getByRole("textbox", { name: "메모" }))
  assert.ok(within(dialog).getByTestId("report-submit").textContent.includes("신고하기"))
  assert.ok(within(dialog).getByTestId("report-cancel").textContent.includes("취소"))
})

test("A13-F-231 욕설 고르고 신고하기 → POST /reports 1번 → 접수 글, 그 줄 \"신고됨\" 꺼짐", async () => {
  const http = await resultList(5, { "POST /reports": { status: 201, body: { ok: true, reportId: 3 } } })
  const dialog = await openFor()
  await press(within(dialog).getByRole("radio", { name: "욕설" }))
  await press(within(dialog).getByTestId("report-submit"))
  assert.equal(http.to("POST", "/reports").length, 1)
  assert.equal(within(dialog).getByTestId("report-message").textContent, "신고가 접수되었습니다. 운영자가 확인합니다.")
  const done = screen.getByRole("button", { name: "나래 신고됨" })
  assert.equal(done.disabled, true)
})

test("A13-F-232 409 DUPLICATE_REPORT → 글 + 그 줄 \"신고됨\"", async () => {
  await resultList(5, { "POST /reports": { status: 409, body: { success: false, code: "DUPLICATE_REPORT", message: "이미 신고함" } } })
  const dialog = await openFor()
  await press(within(dialog).getByRole("radio", { name: "욕설" }))
  await press(within(dialog).getByTestId("report-submit"))
  assert.equal(within(dialog).getByTestId("report-message").textContent, "이미 이 판에서 신고한 플레이어입니다.")
  assert.ok(screen.getByRole("button", { name: "나래 신고됨" }))
})

test("A13-F-233 답 오기 전 → 단추 \"보내는 중\"·꺼짐, 두 번 눌러도 요청 1번", async () => {
  const http = await resultList(5, { "POST /reports": HOLD })
  const dialog = await openFor()
  await press(within(dialog).getByRole("radio", { name: "욕설" }))
  const submit = within(dialog).getByTestId("report-submit")
  await press(submit)
  await press(submit)
  assert.ok(submit.textContent.includes("보내는 중"))
  assert.equal(submit.disabled, true)
  assert.equal(http.to("POST", "/reports").length, 1)
  await http.release("POST", "/reports", { status: 201, body: { ok: true, reportId: 4 } })
})

test("A13-F-234 6명 판 전적 목록 → 남의 줄 5개에 \"신고\", 내 줄엔 없음", async () => {
  seat(6)
  installFetch()
  await act(async () => {
    render(h(InGamePlayerSessionProvider, null, h(PlayerRecordListContent)))
    await settle()
  })
  assert.equal(rowButtons().length, 5)
  assert.equal(screen.queryByRole("button", { name: `${NAMES[0]} 신고` }), null)
  for (const name of NAMES.slice(1)) assert.ok(screen.getByRole("button", { name: `${name} 신고` }))
})

test("A13-F-235 5명 판 결과 참가자 목록 → 남의 줄 4개에 \"신고\"", async () => {
  await resultList(5)
  assert.equal(rowButtons().length, 4)
  assert.equal(screen.queryByRole("button", { name: `${NAMES[0]} 신고` }), null)
})
