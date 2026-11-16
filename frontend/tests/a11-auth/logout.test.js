// 로그아웃 시험 — 로비 메뉴 "종료"가 서버 로그아웃 성공·실패에 따라 어떻게 되나
// 목록 A11a 화면 상태 A11-F-093~095, 화면 부품 A11-F-266~267
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, rtl, serve, sent, resetAll, settle, renderHookInRouter, renderRoutes, useAuthStore,
  confirms, answerConfirm, fakeLocation,
} from "./a11Kit.mjs"

const { useLobbyMenuNav } = await import("../../src/domains/lobby/hooks/useLobbyMenuNav.js")
const { default: LobbyMenuNav } = await import("../../src/domains/lobby/components/LobbyMenuNav.jsx")

const USER = { uuid: "u-a11-out", nickname: "시험사람", role: "USER" }
const LOGOUT_OK = { status: 200, body: { success: true, message: "성공적으로 로그아웃 되었습니다." } }
const LOGOUT_FAIL = { status: 500, body: { success: false, message: "서버 내부에서 에러가 발생했습니다." } }

test.beforeEach(() => {
  resetAll()
  fakeLocation("/lobby")
  useAuthStore.getState().login(USER)
})
test.afterEach(() => resetAll())

async function pressExit(result) {
  await rtl.act(async () => { await result.current.handleMenuClick("exit") })
  await settle()
}

test("A11-F-093 서버 로그아웃 성공 → 스토어 로그아웃 + /login", async () => {
  serve({ "POST /auth/logout": LOGOUT_OK })
  const { result, router } = renderHookInRouter(() => useLobbyMenuNav(), { at: "/lobby" })
  await pressExit(result)
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(router.state.location.pathname, "/login")
})

test("A11-F-094 서버 실패 + 확인 창 \"확인\" → 이 기기만 로그아웃 + /login", async () => {
  serve({ "POST /auth/logout": LOGOUT_FAIL })
  answerConfirm(true)
  const { result, router } = renderHookInRouter(() => useLobbyMenuNav(), { at: "/lobby" })
  await pressExit(result)
  assert.equal(confirms.length, 1)
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(router.state.location.pathname, "/login")
})

test("A11-F-095 서버 실패 + \"취소\" → 그대로 (로그인 유지·주소 그대로)", async () => {
  serve({ "POST /auth/logout": LOGOUT_FAIL })
  answerConfirm(false)
  const { result, router } = renderHookInRouter(() => useLobbyMenuNav(), { at: "/lobby" })
  await pressExit(result)
  assert.equal(confirms.length, 1)
  assert.equal(useAuthStore.getState().user?.uuid, USER.uuid)
  assert.equal(router.state.location.pathname, "/lobby")
})

// 진짜 로비 메뉴를 그림 (/login 자리엔 표시 글만)
function renderMenu() {
  return renderRoutes([
    { path: "/lobby", element: h(LobbyMenuNav) },
    { path: "/login", element: h("p", null, "로그인 화면") },
  ], { at: "/lobby" })
}

test("A11-F-266 로비 메뉴 \"종료\" 누름 → 로그아웃 요청 1번 + /login", async () => {
  serve({ "POST /auth/logout": LOGOUT_OK })
  const { router } = renderMenu()
  await rtl.act(async () => { rtl.fireEvent.click(rtl.screen.getByRole("button", { name: "종료" })) })
  await settle()
  assert.equal(sent("POST", "/auth/logout").length, 1)
  assert.equal(router.state.location.pathname, "/login")
})

test("A11-F-267 로그아웃 실패 → 확인 창 글 \"로그아웃 요청이 실패했습니다. 이 기기 화면에서만 로그아웃할까요?…\"", async () => {
  serve({ "POST /auth/logout": LOGOUT_FAIL })
  answerConfirm(false)
  renderMenu()
  await rtl.act(async () => { rtl.fireEvent.click(rtl.screen.getByRole("button", { name: "종료" })) })
  await settle()
  assert.equal(confirms.length, 1)
  assert.ok(confirms[0].startsWith("로그아웃 요청이 실패했습니다. 이 기기 화면에서만 로그아웃할까요?"))
})
