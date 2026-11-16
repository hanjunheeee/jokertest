// 관리자 요청 도구 시험: 쓰기에만 쓰기 확인 머리글, 자동 새로고침 머리글, 같은 출처 /admin-api 주소, 401이면 로그인 화면
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-028~032, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-admin-client.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, screen, cleanup, openAt, settle, createFakeServer, ME_OK } from "./a14-kit.mjs"

const { adminApi, setCsrfToken } = await import("../../src/admin/shared/api/adminClient.js")
const { AdminScreens } = await import("../../src/admin/app/AdminApp.jsx")

// 시험용 가짜 쓰기 확인 값
const FAKE_CSRF = "fake-csrf-token-for-test"

test.afterEach(() => {
  cleanup()
  setCsrfToken(null)
})

// 요청 하나 보내고 보낸 머리글 꺼내기
async function sentHeaders(run, key) {
  const server = createFakeServer()
  server.answer(key, 200, { ok: true })
  setCsrfToken(FAKE_CSRF)
  await run()
  assert.equal(server.calls.length, 1)
  return server.calls[0]
}

test("A14-F-028 쓰기 → X-Admin-Csrf 붙음: POST /announcements → 머리글에 받은 쓰기 확인 값", async () => {
  const call = await sentHeaders(() => adminApi.send("POST", "/announcements", { title: "t" }), "POST /admin-api/announcements")
  assert.equal(call.headers["X-Admin-Csrf"], FAKE_CSRF)
})

test("A14-F-029 읽기 → X-Admin-Csrf 안 붙음: GET /dashboard", async () => {
  const call = await sentHeaders(() => adminApi.get("/dashboard"), "GET /admin-api/dashboard")
  assert.equal(Object.hasOwn(call.headers, "X-Admin-Csrf"), false)
  assert.equal(Object.hasOwn(call.headers, "X-Admin-Background"), false)
})

test("A14-F-030 자동 새로고침 → X-Admin-Background: 1", async () => {
  const call = await sentHeaders(() => adminApi.get("/dashboard", { background: true }), "GET /admin-api/dashboard")
  assert.equal(call.headers["X-Admin-Background"], "1")
})

test("A14-F-031 주소는 같은 출처 /admin-api/...: 회원 찾기 → \"/admin-api/members?q=…\" (다른 주소 없음)", async () => {
  const call = await sentHeaders(() => adminApi.get("/members?q=ga"), "GET /admin-api/members?q=ga")
  assert.equal(call.url, "/admin-api/members?q=ga")
  assert.equal(/^https?:|^\/\//.test(call.url), false)
})

test("A14-F-032 401이면 로그인 화면으로: 운영 현황 요청이 401 ADMIN_LOGIN_REQUIRED → 로그인 화면", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  server.answer("GET /admin-api/dashboard", 401, { ok: false, code: "ADMIN_LOGIN_REQUIRED", message: "" })
  await openAt("/dashboard", h(AdminScreens))
  await settle(20)
  assert.ok(screen.queryByRole("heading", { name: "관리자 로그인" }) !== null, "로그인 화면으로 안 감")
  assert.ok(screen.queryByRole("navigation", { name: "관리자 메뉴" }) === null, "메뉴가 남아 있음")
})
