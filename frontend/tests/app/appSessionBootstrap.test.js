// FE-010: 앱 첫 그리기 때 보호 화면 문지기가 세션 확인 전(idle) 값으로 판정하지 않게, 라우터가 그려지기 전에 확인 중이어야 함
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { register } from "node:module"

register(new URL("../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { markSessionCheckPending } = await import("../../src/app/sessionCheckGate.js")
const { resolveProtectedRouteState } = await import("../../src/domains/auth/utils/bootstrapSession.js")

function fakeStore(sessionBootstrap) {
  const state = { sessionBootstrap, setSessionBootstrap: (next) => { state.sessionBootstrap = next } }
  return { getState: () => state }
}

test("FE-010: idle이면 pending으로 바꿔 문지기가 기다림 (로그인 안 된 채 바로 /login 판정 안 함)", () => {
  const store = fakeStore("idle")
  markSessionCheckPending(store)
  assert.equal(store.getState().sessionBootstrap, "pending")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "pending" }), "pending")
})

test("FE-010: 이미 확인 중·끝이면 그대로 둠", () => {
  for (const phase of ["pending", "done"]) {
    const store = fakeStore(phase)
    markSessionCheckPending(store)
    assert.equal(store.getState().sessionBootstrap, phase)
  }
})

test("FE-010: App은 라우터를 그리기 전 첫 그리기에서 부름 (useState 첫 값)", () => {
  const source = readFileSync(new URL("../../src/app/App.jsx", import.meta.url), "utf8")
  assert.match(source, /useState\(\(\) => markSessionCheckPending\(\)\)/)
  assert.ok(source.indexOf("markSessionCheckPending()") < source.indexOf("<RouterProvider"))
})
