// 공용 응답 풀기 시험: 실패 답에 서버 글이 없으면 기본 글을 안 채움 → 화면이 준비한 실패 글이 나옴 (모음 글 C-020)
// 목록 A01-F-670-2~670-7 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기(frontend): node --experimental-test-module-mocks --test tests/shared/api/goH-response-message.test.js
import test from "node:test"
import assert from "node:assert/strict"

const { handleApiResponse, setUnauthorizedHandler } = await import("../../../src/shared/api/response.js")

test.afterEach(() => setUnauthorizedHandler(null))

// 서버 답 흉내 (본문이 undefined면 json이 아닌 본문)
const reply = (status, body) => new Response(body === undefined ? "<html>" : JSON.stringify(body), { status })

// 실패 답을 풀어 던진 오류를 받음
async function thrownBy(response) {
  try {
    await handleApiResponse(response)
  } catch (error) {
    return error
  }
  throw new Error("오류를 안 던짐")
}

test("A01-F-670-2 실패 답에 글 없음(500 {}) → message 없음(undefined), 화면의 ?? · || 준비 글이 나옴", async () => {
  const error = await thrownBy(reply(500, {}))
  assert.equal(error.message, undefined)
  assert.equal(error.status, 500)
  assert.equal(error.message ?? "차단하지 못했습니다.", "차단하지 못했습니다.")
  assert.equal(error.message || "검색 중 오류가 발생했습니다.", "검색 중 오류가 발생했습니다.")
})

test("A01-F-670-3 실패 답 글이 빈 글자·json 아닌 본문 → message 없음", async () => {
  assert.equal((await thrownBy(reply(409, { message: "" }))).message, undefined)
  assert.equal((await thrownBy(reply(502, undefined))).message, undefined)
})

test("A01-F-670-4 실패 답에 서버 글 있음 → 그 글 그대로 + code·status", async () => {
  const error = await thrownBy(reply(409, { message: "방이 가득 차 초대를 보낼 수 없습니다.", code: "ROOM_FULL" }))
  assert.equal(error.message, "방이 가득 차 초대를 보낼 수 없습니다.")
  assert.equal(error.code, "ROOM_FULL")
  assert.equal(error.status, 409)
  assert.ok(error instanceof Error)
})

test("A01-F-670-5 글 없는 실패 답도 code·남은 횟수 같은 칸은 그대로 옮김", async () => {
  const error = await thrownBy(reply(400, { code: "CODE_INVALID", attemptsRemaining: 2, resendAfterSec: 30 }))
  assert.equal(error.message, undefined)
  assert.equal(error.code, "CODE_INVALID")
  assert.equal(error.attemptsRemaining, 2)
  assert.equal(error.resendAfterSec, 30)
})

test("A01-F-670-6 401은 그대로: 처리 함수 없고 글 없음 → \"인증에 실패했습니다.\", 가입 인증 401 → \"이메일 인증이 필요합니다.\"", async () => {
  assert.equal((await thrownBy(reply(401, {}))).message, "인증에 실패했습니다.")
  const proof = await thrownBy(reply(401, { success: false, code: "SIGNUP_PROOF_REQUIRED" }))
  assert.equal(proof.message, "이메일 인증이 필요합니다.")
  assert.equal(proof.status, 401)
})

test("A01-F-670-7 성공 답은 그대로: { data } 면 data만", async () => {
  assert.deepEqual(await handleApiResponse(reply(200, { data: { a: 1 } })), { a: 1 })
  assert.deepEqual(await handleApiResponse(reply(200, { a: 1 })), { a: 1 })
})
