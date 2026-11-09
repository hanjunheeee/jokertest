// AD-046 관리자 서버 부르기 시험: 쓰기 확인 머리글·백그라운드 머리글·오류 모양·로그인 풀림 알림·한국 시각
import assert from "node:assert/strict"
import test from "node:test"
import { createFakeServer } from "../helpers/adminDom.mjs"

const { adminApi, AdminApiError, setCsrfToken, setAuthLostHandlers } = await import("../../../src/admin/shared/api/adminClient.js")
const { adminErrorText } = await import("../../../src/admin/shared/api/errorText.js")
const { formatKst } = await import("../../../src/admin/shared/utils/time.js")
const { newRequestId } = await import("../../../src/admin/shared/utils/requestId.js")

test("AD-046 쓰기에 X-Admin-Csrf, 읽기엔 안 붙임", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/members", 200, { ok: true, items: [], nextBefore: null })
  server.answer("POST /admin-api/announcements", 201, { ok: true, auditId: 7 })
  setCsrfToken("csrf-abc")

  const list = await adminApi.get("/members")
  const sent = await adminApi.send("POST", "/announcements", { title: "공지" })

  assert.deepEqual(list, { items: [], nextBefore: null })
  assert.deepEqual(sent, { auditId: 7 })
  assert.equal(server.calls[0].headers["X-Admin-Csrf"], undefined)
  assert.equal(server.calls[1].headers["X-Admin-Csrf"], "csrf-abc")
  assert.equal(server.calls[1].body, JSON.stringify({ title: "공지" }))
})

test("AD-046 자동 새로고침엔 X-Admin-Background: 1", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/dashboard", 200, { ok: true, totalMembers: 3 })
  await adminApi.get("/dashboard", { background: true })
  await adminApi.get("/dashboard")
  assert.equal(server.calls[0].headers["X-Admin-Background"], "1")
  assert.equal(server.calls[1].headers["X-Admin-Background"], undefined)
})

test("AD-046 실패는 AdminApiError { status, code, message, details }", async () => {
  const server = createFakeServer()
  server.answer("POST /admin-api/members/u1/unban", 400, { ok: false, code: "REASON_REQUIRED", message: "사유를 적어 주세요.", field: "reason" })
  await assert.rejects(adminApi.send("POST", "/members/u1/unban", {}), (error) => {
    assert.ok(error instanceof AdminApiError)
    assert.equal(error.status, 400)
    assert.equal(error.code, "REASON_REQUIRED")
    assert.equal(error.message, "사유를 적어 주세요.")
    assert.deepEqual(error.details, { field: "reason" })
    return true
  })
})

test("AD-046 로그인 풀림(401)·권한 없음(403)은 알림, 로그인 틀림 401은 알림 없음", async () => {
  const server = createFakeServer()
  const lost = []
  const stop = setAuthLostHandlers({ loginLost: (code) => lost.push(code), accessLost: (code) => lost.push(code) })
  server.answer("GET /admin-api/members", 401, { ok: false, code: "ADMIN_SESSION_EXPIRED", message: "x" })
  server.answer("GET /admin-api/live", 403, { ok: false, code: "ADMIN_ACCESS_REQUIRED", message: "x" })
  server.answer("POST /admin-api/auth/login", 401, { ok: false, code: "ADMIN_LOGIN_FAILED", message: "x" })

  await assert.rejects(adminApi.get("/members"))
  await assert.rejects(adminApi.get("/live"))
  await assert.rejects(adminApi.send("POST", "/auth/login", {}))
  stop()
  await assert.rejects(adminApi.get("/members"))

  assert.deepEqual(lost, ["ADMIN_SESSION_EXPIRED", "ADMIN_ACCESS_REQUIRED"])
})

test("AD-046 서버에 못 닿으면 NETWORK_ERROR, 바쁨은 잠시 뒤 다시 문구", async () => {
  globalThis.fetch = async () => { throw new TypeError("failed") }
  await assert.rejects(adminApi.get("/members"), (error) => error.code === "NETWORK_ERROR" && error.status === 0)
  assert.match(adminErrorText({ code: "ADMIN_BUSY" }), /잠시 뒤 다시/)
  assert.match(adminErrorText({ code: "ADMIN_QUERY_TIMEOUT" }), /잠시 뒤 다시/)
  assert.match(adminErrorText({ code: "RATE_LIMITED" }), /잠시 뒤 다시/)
  assert.match(adminErrorText("ADMIN_INTERNAL"), /잠시 뒤 다시/)
})

test("AD-046 시각은 한국 시각으로, 빈 값은 —", () => {
  assert.equal(formatKst("2026-11-10T03:00:00.000Z"), "2026-11-10 12:00")
  assert.equal(formatKst("2026-11-10T15:30:00.000Z"), "2026-11-11 00:30")
  assert.equal(formatKst(null), "—")
  assert.equal(formatKst("엉뚱한 값"), "—")
})

test("요청 번호는 UUID 모양, 매번 다름", () => {
  const first = newRequestId()
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(first, newRequestId())
})
