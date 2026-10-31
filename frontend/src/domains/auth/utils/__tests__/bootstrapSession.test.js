import test from "node:test"
import assert from "node:assert/strict"
import { create } from "zustand"
import { bootstrapSession, resolveProtectedRouteState } from "../bootstrapSession.js"

function makeStore(initial = {}) {
  return create((set) => ({
    isLoggedIn: false, user: null, identityGeneration: 0, sessionBootstrap: "idle", ...initial,
    setSessionBootstrap: (sessionBootstrap) => set({ sessionBootstrap }),
    adoptRole: (role) => set((s) => (s.user ? { user: { ...s.user, role } } : {})),
    login: (user) => set((s) => ({ isLoggedIn: true, user, identityGeneration: s.identityGeneration + 1 })),
    logout: () => set((s) => ({ isLoggedIn: false, user: null, identityGeneration: s.identityGeneration + 1 })),
  }))
}

test("저장값이 없고 쿠키 세션만 있으면 서버 uuid·닉네임으로 로그인 상태를 만든다", async () => {
  const store = makeStore()
  const seen = []
  const result = await bootstrapSession({
    getMe: async () => { seen.push(store.getState().sessionBootstrap); return { uuid: "u-1", role: "USER" } },
    getMyProfile: async () => ({ nickname: "실검증1" }),
    store,
  })
  assert.deepEqual(result, { outcome: "adopted", uuid: "u-1" })
  assert.deepEqual(seen, ["pending"], "서버를 묻는 동안 pending이어야 한다")
  const s = store.getState()
  assert.equal(s.isLoggedIn, true)
  assert.deepEqual(s.user, { uuid: "u-1", role: "USER", nickname: "실검증1" })
  assert.equal(s.identityGeneration, 1)
  assert.equal(s.sessionBootstrap, "done")
})

test("저장값의 uuid가 서버와 다르면 서버 계정으로 교체하고 세대를 올린다", async () => {
  const store = makeStore({ isLoggedIn: true, user: { uuid: "u-4", role: "USER", nickname: "실검증4" } })
  const result = await bootstrapSession({
    getMe: async () => ({ uuid: "u-1", role: "USER" }),
    getMyProfile: async () => ({ nickname: "실검증1" }),
    store,
  })
  assert.deepEqual(result, { outcome: "replaced", uuid: "u-1" })
  assert.equal(store.getState().user.uuid, "u-1")
  assert.equal(store.getState().user.nickname, "실검증1")
  assert.equal(store.getState().identityGeneration, 1)
})

test("같은 계정이면 닉네임·세대를 유지하고 프로필을 다시 묻지 않는다", async () => {
  const store = makeStore({ isLoggedIn: true, user: { uuid: "u-1", role: "USER", nickname: "실검증1" } })
  let profileCalls = 0
  const result = await bootstrapSession({
    getMe: async () => ({ uuid: "u-1", role: "ADMIN" }),
    getMyProfile: async () => { profileCalls += 1; return { nickname: "x" } },
    store,
  })
  assert.deepEqual(result, { outcome: "kept", uuid: "u-1" })
  assert.equal(profileCalls, 0)
  assert.deepEqual(store.getState().user, { uuid: "u-1", role: "ADMIN", nickname: "실검증1" })
  assert.equal(store.getState().identityGeneration, 0)
  assert.equal(store.getState().sessionBootstrap, "done")
})

test("서버 세션이 없으면(401·갱신 실패) 로그아웃하고 done으로 끝난다", async () => {
  const store = makeStore({ isLoggedIn: true, user: { uuid: "u-1", role: "USER", nickname: "실검증1" } })
  const result = await bootstrapSession({
    getMe: async () => { throw new Error("인증에 실패했습니다.") },
    getMyProfile: async () => ({ nickname: "x" }),
    store,
  })
  assert.deepEqual(result, { outcome: "logged-out", uuid: null })
  assert.equal(store.getState().isLoggedIn, false)
  assert.equal(store.getState().user, null)
  assert.equal(store.getState().sessionBootstrap, "done")
})

test("닉네임 조회가 실패해도 로그인 자체는 채택한다(닉네임 null)", async () => {
  const store = makeStore()
  await bootstrapSession({
    getMe: async () => ({ uuid: "u-1", role: "USER" }),
    getMyProfile: async () => { throw new Error("profile down") },
    store,
  })
  assert.deepEqual(store.getState().user, { uuid: "u-1", role: "USER", nickname: null })
})

test("resolveProtectedRouteState — pending이면 그리지 않고, idle/done이면 저장값으로 판단한다", () => {
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "pending" }), "pending")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: true, sessionBootstrap: "pending" }), "pending")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: true, sessionBootstrap: "done" }), "allow")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "done" }), "redirect")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: true, sessionBootstrap: "idle" }), "allow")
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "idle" }), "redirect")
})
