// 세션 유지 시험 — access 만료 때 갱신 한 번·동시 만료·401에 튕기는 화면·앱 시작 때 세션 맞추기·보호 화면 문지기
// 목록 A11a 화면 상태 A11-F-080~092, 화면 부품 A11-F-268~269 (서버는 가짜 답)
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, rtl, serve, sent, resetAll, settle, fakeLocation, renderRoutes, useAuthStore,
} from "./a11Kit.mjs"

const { apiClient } = await import("../../src/shared/api/client.js")
const { getMeApi } = await import("../../src/domains/auth/api/auth.api.js")
const { getMyProfileApi } = await import("../../src/domains/user/api/user.api.js")
const { bootstrapSession, resolveProtectedRouteState } = await import("../../src/domains/auth/utils/bootstrapSession.js")
const { default: ProtectedRoute } = await import("../../src/shared/ui/ProtectedRoute.jsx")

const EXPIRED = { status: 401, body: { success: false, message: "액세스 토큰이 만료되었습니다.", code: "ACCESS_TOKEN_EXPIRED" } }
const NEED_LOGIN = { status: 401, body: { success: false, message: "로그인이 필요합니다." } }
const ME = (uuid) => ({ status: 200, body: { success: true, data: { uuid, role: "USER" } } })
const USER = { uuid: "u-a11-s1", nickname: "시험사람", role: "USER" }

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

// 요청 하나 보내고 결과·오류를 같이 받음
async function call(endpoint) {
  try {
    return { value: await apiClient(endpoint) }
  } catch (error) {
    return { error }
  }
}

test("A11-F-080 401 ACCESS_TOKEN_EXPIRED → refresh 1번 → 같은 요청 다시 → 성공", async () => {
  fakeLocation("/lobby")
  let refreshed = false
  serve({
    "GET /auth/me": () => (refreshed ? ME(USER.uuid) : EXPIRED),
    "POST /auth/refresh": () => { refreshed = true; return { status: 200, body: { success: true } } },
  })
  const r = await call("/auth/me")
  assert.equal(r.value?.uuid, USER.uuid)
  assert.equal(sent("POST", "/auth/refresh").length, 1)
  assert.equal(sent("GET", "/auth/me").length, 2)
})

test("A11-F-081 refresh 실패 → 공통 401 처리 (로그아웃 + 로그인 화면으로)", async () => {
  const location = fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({
    "GET /auth/me": EXPIRED,
    "POST /auth/refresh": { status: 401, body: { success: false, message: "갱신 자격이 없습니다. 다시 로그인해주세요." } },
  })
  await call("/auth/me")
  assert.equal(useAuthStore.getState().user, null)
  assert.deepEqual(location.replaced, ["/login"])
})

test("A11-F-082 code 없는 401 → refresh 안 함", async () => {
  fakeLocation("/lobby")
  serve({ "GET /auth/me": NEED_LOGIN, "POST /auth/refresh": { status: 200, body: { success: true } } })
  await call("/auth/me")
  assert.equal(sent("POST", "/auth/refresh").length, 0)
})

test("A11-F-083 다시 보낸 요청도 401 만료 → refresh 또 안 함 (끝없이 안 돎)", async () => {
  fakeLocation("/lobby")
  serve({ "GET /auth/me": EXPIRED, "POST /auth/refresh": { status: 200, body: { success: true } } })
  await call("/auth/me")
  assert.equal(sent("POST", "/auth/refresh").length, 1)
  assert.equal(sent("GET", "/auth/me").length, 2)
})

test("A11-F-084 만료 401 요청 3개 동시 → refresh 1번, 3개 다 다시 보내 성공", async () => {
  fakeLocation("/lobby")
  let refreshed = false
  serve({
    "GET /auth/me": () => (refreshed ? ME(USER.uuid) : EXPIRED),
    // 갱신 답을 조금 늦게 줘서 셋이 다 만료를 본 뒤 끝나게 함
    "POST /auth/refresh": () => new Promise((resolve) => {
      setTimeout(() => { refreshed = true; resolve({ status: 200, body: { success: true } }) }, 20)
    }),
  })
  const results = await Promise.all([call("/auth/me"), call("/auth/me"), call("/auth/me")])
  assert.equal(sent("POST", "/auth/refresh").length, 1)
  assert.deepEqual(results.map((r) => r.value?.uuid), [USER.uuid, USER.uuid, USER.uuid])
})

// 공개 화면에서 401: 로그아웃은 되지만 주소는 그대로, 오류만
async function publicScreen401(path) {
  const location = fakeLocation(path)
  useAuthStore.getState().login(USER)
  serve({ "GET /auth/me": NEED_LOGIN })
  const r = await call("/auth/me")
  assert.equal(useAuthStore.getState().user, null)
  assert.deepEqual(location.replaced, [])
  assert.deepEqual(location.assigned, [])
  assert.ok(r.error instanceof Error)
}

test("A11-F-085 /login 에서 401 → 스토어 로그아웃, 주소 그대로·오류만", async () => {
  await publicScreen401("/login")
})

test("A11-F-086 /find-id/ (끝 빗금) 에서 401 → 스토어 로그아웃, 주소 그대로·오류만", async () => {
  await publicScreen401("/find-id/")
})

test("A11-F-087 /lobby 에서 401 → 스토어 로그아웃 + /login", async () => {
  const location = fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
  serve({ "GET /auth/me": NEED_LOGIN })
  await call("/auth/me")
  assert.equal(useAuthStore.getState().user, null)
  assert.deepEqual(location.replaced, ["/login"])
})

// 앱 시작 때 세션 맞추기 (진짜 요청 함수 + 가짜 서버)
async function boot() {
  fakeLocation("/")
  return bootstrapSession({ getMe: getMeApi, getMyProfile: getMyProfileApi, store: useAuthStore })
}

test("A11-F-088 저장된 계정 = 서버 uuid → 그대로, 확인 단계 done", async () => {
  useAuthStore.getState().login(USER)
  serve({ "GET /auth/me": ME(USER.uuid) })
  await boot()
  assert.equal(useAuthStore.getState().user?.uuid, USER.uuid)
  assert.equal(useAuthStore.getState().user?.nickname, USER.nickname)
  assert.equal(useAuthStore.getState().sessionBootstrap, "done")
})

test("A11-F-089 저장된 계정과 다른 uuid → 서버 계정으로 바꿈, 확인 단계 done", async () => {
  useAuthStore.getState().login(USER)
  serve({
    "GET /auth/me": ME("u-a11-other"),
    "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "다른사람" } } },
  })
  await boot()
  assert.equal(useAuthStore.getState().user?.uuid, "u-a11-other")
  assert.equal(useAuthStore.getState().sessionBootstrap, "done")
})

test("A11-F-090 /auth/me 실패 → 로그아웃, 확인 단계 done", async () => {
  useAuthStore.getState().login(USER)
  serve({ "GET /auth/me": NEED_LOGIN })
  await boot()
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.equal(useAuthStore.getState().sessionBootstrap, "done")
})

test("A11-F-091 보호 화면: 세션 확인 중 → 기다림", () => {
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "pending" }), "pending")
})

test("A11-F-092 보호 화면: 확인 끝 + 로그아웃 → 로그인 화면으로", () => {
  assert.equal(resolveProtectedRouteState({ isAuthenticated: false, sessionBootstrap: "done" }), "redirect")
})

// 보호 화면 묶음 (로비 자리엔 표시 글만)
function renderGuarded() {
  return renderRoutes([
    { path: "/", element: h(ProtectedRoute), children: [{ path: "lobby", element: h("p", null, "로비 화면") }] },
    { path: "/login", element: h("p", null, "로그인 화면") },
  ], { at: "/lobby" })
}

test("A11-F-268 로그아웃 상태(확인 끝)로 /lobby → 로그인 화면", async () => {
  useAuthStore.setState({ isLoggedIn: false, user: null, sessionBootstrap: "done" })
  const { router } = renderGuarded()
  await settle()
  assert.equal(router.state.location.pathname, "/login")
  assert.ok(rtl.screen.queryByText("로그인 화면"))
  assert.equal(rtl.screen.queryByText("로비 화면"), null)
})

test("A11-F-269 세션 확인 중 /lobby → 로비 안 그림·기다림 (로그인 화면으로도 안 감)", async () => {
  useAuthStore.setState({ isLoggedIn: false, user: null, sessionBootstrap: "pending" })
  const { router } = renderGuarded()
  await settle()
  assert.equal(router.state.location.pathname, "/lobby")
  assert.equal(rtl.screen.queryByText("로비 화면"), null)
  assert.equal(rtl.screen.queryByText("로그인 화면"), null)
})
