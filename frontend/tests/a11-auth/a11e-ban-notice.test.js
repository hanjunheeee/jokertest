// 정지 403 공통 처리 시험 — 로그인 중 요청이 정지(ACCOUNT_BANNED) 답을 받으면 정지 글 알림 한 번 뒤 로그아웃·로그인 화면, 로그인 시도 정지 글은 그대로
// 목록 A11a 화면 상태 A11-F-935~939 ("세션 끊김 까닭으로 더한 것", 서버는 가짜 답)
import test from "node:test"
import assert from "node:assert/strict"
import { alerts, serve, resetAll, fakeLocation, useAuthStore } from "./a11Kit.mjs"

const { apiClient } = await import("../../src/shared/api/client.js")

const USER = { uuid: "u-a11-ban1", nickname: "시험사람", role: "USER" }
const BAN_TEXT = "정지된 계정입니다. 사유: 시험 정지"
const BANNED = { status: 403, body: { success: false, message: BAN_TEXT, code: "ACCOUNT_BANNED" } }

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

// 요청 하나 보내고 결과·오류를 같이 받음
async function call(endpoint, options) {
  try {
    return { value: await apiClient(endpoint, options) }
  } catch (error) {
    return { error }
  }
}

test("A11-F-935 로비에서 요청이 정지 403 → 서버 정지 글 알림, 로그아웃, /login", async () => {
  const location = fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({ "GET /user/me/achievements": BANNED })
  await call("/user/me/achievements")
  assert.deepEqual(alerts, [BAN_TEXT])
  assert.equal(useAuthStore.getState().user, null)
  assert.deepEqual(location.replaced, ["/login"])
})

test("A11-F-936 정지 직후 요청 3개가 같이 정지 403 → 알림 1번, 로그아웃, /login", async () => {
  const location = fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({ "GET /user/me/achievements": BANNED, "GET /auth/me": BANNED, "GET /friends": BANNED })
  await Promise.all([call("/user/me/achievements"), call("/auth/me"), call("/friends")])
  assert.deepEqual(alerts, [BAN_TEXT])
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.ok(location.replaced.length >= 1 && location.replaced.every((to) => to === "/login"), `이동: ${location.replaced}`)
})

test("A11-F-937 글 없는 정지 403 → 기본 정지 글 알림", async () => {
  fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({ "GET /auth/me": { status: 403, body: { success: false, code: "ACCOUNT_BANNED" } } })
  await call("/auth/me")
  assert.deepEqual(alerts, ["정지된 계정입니다. 운영정책을 확인해주세요."])
})

test("A11-F-938 로그인 시도 정지 403(code 없음) → 공통 처리 안 탐: 그 글로 오류, 알림·이동 없음", async () => {
  const location = fakeLocation("/login")
  serve({ "POST /auth/login": { status: 403, body: { success: false, message: BAN_TEXT } } })
  const r = await call("/auth/login", { method: "POST", body: JSON.stringify({ email: "tester@example.com", password: "testpass1" }) })
  assert.equal(r.error?.status, 403)
  assert.equal(r.error?.message, BAN_TEXT)
  assert.deepEqual(alerts, [])
  assert.deepEqual(location.replaced, [])
})

test("A11-F-939 정지 아닌 403(다른 code) → 그대로 오류, 로그인 유지", async () => {
  const location = fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({ "GET /economy/accounts/x/wallet": { status: 403, body: { ok: false, code: "ECONOMY_FORBIDDEN", message: "다른 계정의 경제 데이터에 접근할 수 없습니다." } } })
  const r = await call("/economy/accounts/x/wallet")
  assert.equal(r.error?.status, 403)
  assert.equal(r.error?.code, "ECONOMY_FORBIDDEN")
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  assert.deepEqual(alerts, [])
  assert.deepEqual(location.replaced, [])
})
