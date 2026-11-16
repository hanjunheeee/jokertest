// 신고 창 상태 시험 (신고 단추를 보일지·입력 검사·보낼 본문 칸·서버 실패 글)
// 목록 A13-F-046~058 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/report-form.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act } = await import("@testing-library/react")
const { canReportPlayer } = await import("../../src/domains/report/utils/reportForm.js")
const { useReportDialog } = await import("../../src/domains/report/hooks/useReportDialog.js")
const { installFetch, signIn, resetAll, settle } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 판·나·대상 (서버처럼 uuid 모양)
const GAME = "6f1c2d3e-0000-4000-8000-00000000a013"
const SELF = "a1b2c3d4-0000-4000-8000-000000000001"
const OTHER = "b2c3d4e5-0000-4000-8000-000000000002"

test("A13-F-046 대상 = 나(대소문자 다름) → 신고 단추 안 보임", () => {
  assert.equal(canReportPlayer({ targetUuid: SELF.toUpperCase(), selfUuid: SELF, gameId: GAME }), false)
})

test("A13-F-047 판 id 없음(미리보기) → 신고 단추 안 보임", () => {
  assert.equal(canReportPlayer({ targetUuid: OTHER, selfUuid: SELF, gameId: null }), false)
})

test("A13-F-048 다른 사람·판 id 있음 → 신고 단추 보임", () => {
  assert.equal(canReportPlayer({ targetUuid: OTHER, selfUuid: SELF, gameId: GAME }), true)
})

// 신고 창 훅을 열고 사유·메모를 넣은 뒤 보냄 → 훅 값 묶음
async function sendReport({ reasonCode = null, memo = "", answer = { status: 201, body: { ok: true, reportId: 1 } } } = {}) {
  signIn(SELF)
  const http = installFetch({ "POST /reports": answer })
  const { result } = renderHook(() => useReportDialog({ gameId: GAME, selfUuid: SELF }))
  act(() => { result.current.open({ uuid: OTHER, nickname: "지유" }) })
  if (reasonCode) act(() => { result.current.setReason(reasonCode) })
  if (memo) act(() => { result.current.setMemo(memo) })
  await act(async () => { await result.current.send(); await settle() })
  return { http, result }
}

test("A13-F-049 사유 안 고름 → \"신고 사유를 골라 주세요.\", 요청 0", async () => {
  const { http, result } = await sendReport()
  assert.equal(result.current.message, "신고 사유를 골라 주세요.")
  assert.equal(http.to("POST", "/reports").length, 0)
})

test("A13-F-050 기타 + 공백 메모 → \"기타 사유는 메모를 적어 주세요.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ETC", memo: "   " })
  assert.equal(result.current.message, "기타 사유는 메모를 적어 주세요.")
})

test("A13-F-051 메모 501자 → \"메모는 500자까지 적을 수 있습니다.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", memo: "가".repeat(501) })
  assert.equal(result.current.message, "메모는 500자까지 적을 수 있습니다.")
})

test("A13-F-052 공백 메모 → 본문에 memo 없음, 칸은 targetUuid·gameId·reasonCode만", async () => {
  const { http } = await sendReport({ reasonCode: "ABUSE", memo: "   " })
  const [sent] = http.to("POST", "/reports")
  assert.deepEqual(Object.keys(sent.body).sort(), ["gameId", "reasonCode", "targetUuid"])
  assert.deepEqual(sent.body, { targetUuid: OTHER, gameId: GAME, reasonCode: "ABUSE" })
})

// 서버 실패 답 → 보이는 글
const failWith = (status, code) => ({ status, body: code ? { success: false, code, message: "서버 글" } : {} })

test("A13-F-053 DUPLICATE_REPORT → \"이미 이 판에서 신고한 플레이어입니다.\"·신고됨", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(409, "DUPLICATE_REPORT") })
  assert.equal(result.current.message, "이미 이 판에서 신고한 플레이어입니다.")
  assert.equal(result.current.isReported(OTHER), true)
})

test("A13-F-054 429 → \"신고가 너무 많습니다. 잠시 후 다시 시도해주세요.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(429, null) })
  assert.equal(result.current.message, "신고가 너무 많습니다. 잠시 후 다시 시도해주세요.")
})

test("A13-F-055 SELF_REPORT → \"자기 자신은 신고할 수 없습니다.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(400, "SELF_REPORT") })
  assert.equal(result.current.message, "자기 자신은 신고할 수 없습니다.")
})

test("A13-F-056 GAME_NOT_FOUND → \"같이 한 판을 찾을 수 없어 신고하지 못했습니다.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(404, "GAME_NOT_FOUND") })
  assert.equal(result.current.message, "같이 한 판을 찾을 수 없어 신고하지 못했습니다.")
})

test("A13-F-057 INVALID_REPORT → \"신고 내용이 올바르지 않습니다. 다시 확인해주세요.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(400, "INVALID_REPORT") })
  assert.equal(result.current.message, "신고 내용이 올바르지 않습니다. 다시 확인해주세요.")
})

test("A13-F-058 모르는 코드 → \"신고를 보내지 못했습니다. 잠시 후 다시 시도해주세요.\"", async () => {
  const { result } = await sendReport({ reasonCode: "ABUSE", answer: failWith(500, "SOMETHING_ELSE") })
  assert.equal(result.current.message, "신고를 보내지 못했습니다. 잠시 후 다시 시도해주세요.")
})
