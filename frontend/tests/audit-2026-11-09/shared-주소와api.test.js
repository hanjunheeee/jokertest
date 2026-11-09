// 6차 묶음: public 주소 NFC/NFD 맞추기, api 응답 풀기(401·실패·data), api 클라이언트 unauthorizedInline
import test, { mock } from "node:test"
import assert from "node:assert/strict"

mock.module("../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local", DISCORD_SUPPORT_URL: undefined },
})

let fetchImpl
const fetchUrls = []
globalThis.fetch = async (url, options) => {
  fetchUrls.push(url)
  return fetchImpl(url, options)
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const { publicAsset } = await import("../../src/shared/utils/publicAsset.js")
const { handleApiResponse, setUnauthorizedHandler } = await import("../../src/shared/api/response.js")
const { apiClient } = await import("../../src/shared/api/client.js")

test.beforeEach(() => {
  fetchUrls.length = 0
  setUnauthorizedHandler(null)
})

test("public 주소: 앞에 / 붙이고 한글을 인코딩", () => {
  assert.equal(publicAsset("frame/사망.webp"), `/frame/${encodeURIComponent("사망")}.webp`)
  assert.equal(publicAsset("/a b.webp"), "/a%20b.webp")
})

test("public 주소: 같은 이름의 NFD·NFC 경로가 같은 주소가 됨", () => {
  const nfc = "/shopItem/광대1.webp".normalize("NFC")
  const nfd = "/shopItem/광대1.webp".normalize("NFD")
  assert.notEqual(nfc, nfd)
  assert.equal(publicAsset(nfd), publicAsset(nfc))
})

test("응답 풀기: 성공이면 data만, data 칸이 없으면 본문 그대로", async () => {
  assert.deepEqual(await handleApiResponse(json(200, { success: true, data: { x: 1 } })), { x: 1 })
  assert.deepEqual(await handleApiResponse(json(200, { x: 2 })), { x: 2 })
})

test("응답 풀기: 실패 응답은 상태 코드·서버 code·재전송 대기를 붙여 던짐", async () => {
  await assert.rejects(
    handleApiResponse(json(429, { message: "잠시 뒤", code: "RATE", resendAfterSec: 30 })),
    (e) => e.status === 429 && e.code === "RATE" && e.resendAfterSec === 30 && e.message === "잠시 뒤",
  )
})

test("응답 풀기: 본문이 json이 아닌 실패는 기본 문구", async () => {
  await assert.rejects(
    handleApiResponse(new Response("oops", { status: 500 })),
    (e) => e.status === 500 && e.message === "API 요청 중 에러가 발생했습니다.",
  )
})

test("응답 풀기: 가입 인증 401은 로그아웃 처리로 안 넘기고 그대로 던짐", async () => {
  let handled = false
  setUnauthorizedHandler(async () => { handled = true })
  await assert.rejects(
    handleApiResponse(json(401, { success: false, code: "SIGNUP_PROOF_REQUIRED" })),
    (e) => e.status === 401 && e.code === "SIGNUP_PROOF_REQUIRED",
  )
  assert.equal(handled, false)
})

test("응답 풀기: 그 밖의 401은 등록한 처리 함수 결과를 돌려줌", async () => {
  setUnauthorizedHandler(async (body) => ({ loggedOut: true, code: body.code }))
  assert.deepEqual(await handleApiResponse(json(401, { code: "NO_SESSION" })), { loggedOut: true, code: "NO_SESSION" })
})

test("api 클라이언트: unauthorizedInline이면 401을 로그아웃 처리 없이 오류로 던짐(비밀번호 틀림)", async () => {
  let handled = false
  setUnauthorizedHandler(async () => { handled = true })
  fetchImpl = async () => json(401, { message: "현재 비밀번호가 틀렸습니다.", code: "INVALID_PASSWORD" })
  await assert.rejects(
    apiClient("/user/password", { method: "PATCH", unauthorizedInline: true }),
    (e) => e.status === 401 && e.code === "INVALID_PASSWORD" && e.message === "현재 비밀번호가 틀렸습니다.",
  )
  assert.equal(handled, false)
})

test("api 클라이언트: unauthorizedInline 표시는 fetch 옵션에 안 섞이고 쿠키·캐시 끔은 늘 들어감", async () => {
  let seen
  fetchImpl = async (_url, options) => { seen = options; return json(200, { data: 1 }) }
  await apiClient("/x", { method: "POST", unauthorizedInline: true, headers: { "X-A": "1" } })
  assert.equal(Object.hasOwn(seen, "unauthorizedInline"), false)
  assert.equal(seen.credentials, "include")
  assert.equal(seen.cache, "no-store")
  assert.equal(seen.headers["Content-Type"], "application/json")
  assert.equal(seen.headers["X-A"], "1")
  assert.equal(fetchUrls[0], "http://test-api.local/x")
})

test("api 클라이언트: 토큰 만료 401이면 갱신 뒤 다시 보내고, 다시 보낸 요청이 또 401이면 unauthorizedInline 오류", async () => {
  fetchImpl = async (url) => {
    if (url.endsWith("/auth/refresh")) return json(200, { success: true })
    return json(401, { code: "ACCESS_TOKEN_EXPIRED", message: "만료" })
  }
  await assert.rejects(
    apiClient("/user/password", { unauthorizedInline: true }),
    (e) => e.status === 401 && e.code === "ACCESS_TOKEN_EXPIRED",
  )
  assert.deepEqual(fetchUrls, [
    "http://test-api.local/user/password",
    "http://test-api.local/auth/refresh",
    "http://test-api.local/user/password",
  ])
})

test("api 클라이언트: 401 본문 문구가 없으면 기본 문구", async () => {
  fetchImpl = async () => new Response("", { status: 401 })
  await assert.rejects(apiClient("/x", { unauthorizedInline: true }), (e) => e.message === "인증에 실패했습니다.")
})
