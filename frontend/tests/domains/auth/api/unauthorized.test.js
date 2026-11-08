// 401 공통 처리 시험: 로그아웃 상태로 공개 인증 화면(아이디 찾기·재설정 링크)을 열면 /login으로 안 튕김
// 보호 화면만 /login으로 보냄
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

let logoutCalls = 0
mock.module("../../../../src/domains/auth/store/auth.store.js", {
  namedExports: { useAuthStore: { getState: () => ({ logout: () => { logoutCalls += 1 } }) } },
})

const replaced = []
const setPath = (pathname) => {
  globalThis.window = { location: { pathname, replace: (to) => { replaced.push(to) } } }
}

const { handleAuthUnauthorized } = await import("../../../../src/domains/auth/api/unauthorized.js")

for (const pathname of ["/find-id", "/find-id/", "/password-reset", "/password-reset/", "/password-reset/request", "/login", "/"]) {
  test(`공개 인증 화면 ${pathname}: 로그아웃만 하고 이동 없이 오류를 던진다`, async () => {
    replaced.length = 0
    logoutCalls = 0
    setPath(pathname)
    await assert.rejects(handleAuthUnauthorized({ message: "세션 없음" }), /세션 없음/)
    assert.equal(logoutCalls, 1)
    assert.deepEqual(replaced, [])
  })
}

test("보호 화면 /store: 로그아웃 뒤 /login으로 보낸다", async () => {
  replaced.length = 0
  setPath("/store")
  await handleAuthUnauthorized({})
  assert.deepEqual(replaced, ["/login"])
})
