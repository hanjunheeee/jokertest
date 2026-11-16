// 관리자 오류 글 시험: 공통 오류 코드마다 쉬운 글(상태 한 줄 부품에 보이는 글), 모르는 코드는 기본 글, 영역 오류는 서버 글 그대로
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-013~027, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-error-text.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, cleanup } from "./a14-kit.mjs"

const { default: StatusNote } = await import("../../src/admin/shared/ui/StatusNote.jsx")

test.afterEach(() => cleanup())

// 화면 오류 줄에 보이는 글 (서버 글은 비움 — 표 글이 나오는지 봄)
const shownFor = (error) => {
  render(h(StatusNote, { state: "error", error }))
  return screen.getByRole("alert").textContent
}

// 코드 → 글 (목록: errorText.js 표 글 그대로) (값 14)
const CODE_CASES = [
  ["A14-F-013", "NETWORK_ERROR", "서버에 닿지 않아요. 인터넷 연결을 확인하고 다시 해 주세요."],
  ["A14-F-014", "ADMIN_LOGIN_REQUIRED", "로그인이 필요해요."],
  ["A14-F-015", "ADMIN_SESSION_EXPIRED", "오래 쓰지 않아 로그아웃됐어요. 다시 로그인해 주세요."],
  ["A14-F-016", "ADMIN_ACCESS_REQUIRED", "관리자 메일 확인을 거친 사람만 열 수 있어요."],
  ["A14-F-017", "ADMIN_ACCESS_UNAVAILABLE", "권한 확인 서버에 닿지 않아요. 잠시 뒤 다시 해 주세요."],
  ["A14-F-018", "ADMIN_CSRF_FAILED", "화면이 오래돼 요청을 막았어요. 새로 고침한 뒤 다시 해 주세요."],
  ["A14-F-019", "ADMIN_LOGIN_FAILED", "아이디, 비밀번호, OTP 번호 중 맞지 않는 것이 있어요. 다시 확인해 주세요."],
  ["A14-F-020", "ADMIN_EMAIL_MISMATCH", "관리자 메일 확인에 쓴 메일과 이 계정의 메일이 달라요. 본인 계정으로 로그인해 주세요."],
  ["A14-F-021", "RATE_LIMITED", "요청이 너무 많아요. 잠시 뒤 다시 해 주세요."],
  ["A14-F-022", "ADMIN_BUSY", "다른 조회가 밀려 있어요. 잠시 뒤 다시 해 주세요."],
  ["A14-F-023", "ADMIN_QUERY_TIMEOUT", "조회가 오래 걸려 멈췄어요. 잠시 뒤 다시 해 주세요."],
  ["A14-F-024", "ADMIN_INTERNAL", "서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요."],
  ["A14-F-025", "INVALID_INPUT", "입력한 값을 다시 확인해 주세요."],
]
for (const [no, code, text] of CODE_CASES) {
  test(`${no} 오류 코드마다 쉬운 글: ${code} → "${text}"`, () => {
    assert.equal(shownFor({ code, message: "" }), text)
  })
}

test("A14-F-026 모르는 코드 + 서버 글 없음 → \"처리하지 못했어요. 잠시 뒤 다시 해 주세요.\"", () => {
  assert.equal(shownFor({ code: "SOMETHING_NEW", message: "" }), "처리하지 못했어요. 잠시 뒤 다시 해 주세요.")
})

test("A14-F-027 영역 오류는 서버 글 그대로: BALANCE_SHORT + 서버 글 → 그 글", () => {
  const message = "뺏을 양이 모자라요. 지금 100, 뺏으려는 양 500"
  assert.equal(shownFor({ code: "BALANCE_SHORT", message }), message)
})
