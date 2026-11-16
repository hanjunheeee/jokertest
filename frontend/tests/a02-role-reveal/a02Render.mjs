// A02 화면 시험 몫 그리기 준비: 가짜 소켓 끼우기·로그인·판 값 넣기·판 화면/조작 값 그리기·가짜 서버 요청
// a02-role-reveal 폴더 시험 파일들이 같이 씀 (domSetup 다음에 불러야 해서 시험 대상은 모두 await import)
import "../helpers/domSetup.mjs"
import { createFakeSocket } from "./a02Fixtures.mjs"

export const React = await import("react")
export const RTL = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useLocation, createMemoryRouter, RouterProvider } = await import("react-router-dom")
export const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
export const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { InGamePlayerSessionProvider } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionProvider.jsx")
const { InGameActionContext } = await import("../../src/domains/game/ingame/context/InGameActionContext.jsx")
const pageModule = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
export const InGamePage = pageModule.default
const { InGameActionProvider } = pageModule

const h = React.createElement

// 창 열고 닫는 움직임은 바로 끝나게 (시간에 따라 결과가 바뀌지 않게, 시험 환경 설정이라 코드는 그대로)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

// jsdom에 없는 크기 재기 (채팅 칸이 씀) → 아무것도 안 함
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.ResizeObserver = globalThis.ResizeObserver
}

// 서버로 진짜 요청이 안 나가게 fetch를 가짜로: 이모티콘 팔레트는 "안녕" 한 칸으로 답하고 나머지는 빈 성공
export const sentHttp = []
globalThis.fetch = async (url, options = {}) => {
  sentHttp.push({ url: String(url), method: options.method ?? "GET" })
  const body = String(url).includes("emoji-palette")
    ? { slots: ["emoji-basic-hello"], revision: "r1", ownedEmoticonIds: ["emoji-basic-hello"] }
    : {}
  return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } })
}

// 가짜 소켓을 공용 소켓 자리에 끼움 (서버 알림은 socket.trigger로 넣음)
export function installSocket(opts) {
  const socket = createFakeSocket(opts)
  setSocket(socket)
  return socket
}

// 시험 끝 정리: 화면 빼기·판 비우기·탭 저장소 비우기·소켓 빼기
export function resetAll() {
  RTL.cleanup()
  useInGameStore.getState().clearGame()
  try { globalThis.window.sessionStorage.clear() } catch { /* 없음 */ }
  setSocket(null)
}

// 보는 사람으로 로그인
export function loginAs(viewer) {
  useAuthStore.getState().login({ uuid: viewer.uuid, nickname: viewer.nickname })
}

// 판 사람 목록·조작 값만 그림 (판 화면 전체 없이), sink.ctx 에 조작 값, sink.session 에 판 사람 목록
export function renderActionContext() {
  const sink = {}
  function Probe() {
    sink.ctx = React.useContext(InGameActionContext)
    return null
  }
  RTL.render(h(InGamePlayerSessionProvider, null, h(InGameActionProvider, null, h(Probe))))
  return sink
}

// 판 화면 전체 그림 (주소 /ingame, 나가기 막기가 데이터 라우터를 써서 그 라우터로), 밖으로 보내면 "판 밖" 글
export function renderInGamePage() {
  const router = createMemoryRouter([
    { path: "/ingame", element: h(InGamePage) },
    { path: "*", element: h("p", null, "판 밖") },
  ], { initialEntries: ["/ingame"] })
  const view = RTL.render(h(RouterProvider, { router }))
  return { ...view, router }
}

// 화면이 바뀔 때까지 조금씩 기다림 (닫힘 움직임 등), 넘으면 실패
// RTL waitFor는 판 화면 전체와 같이 쓰면 끝나지 않아서(메모리만 늘어남) 작게 따로 둠
export async function waitUntil(check, { timeoutMs = 3_000, stepMs = 25, what = "화면 바뀜" } = {}) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`${what}: ${timeoutMs}ms 안에 안 됨`)
    await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, stepMs)) })
  }
}

// 판 화면에 떠 있는 안내 창(역할 창·단계 안내·밤 차례 안내)을 "확인"으로 다 닫음
export async function dismissOverlays() {
  for (let round = 0; round < 6; round += 1) {
    const dialogs = RTL.screen.queryAllByRole("dialog")
    const confirm = dialogs.map((d) => RTL.within(d).queryByRole("button", { name: "확인" })).find(Boolean)
    if (!confirm) return
    RTL.fireEvent.click(confirm)
    await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
  }
}

// 판 카드 판에서 닉네임으로 카드 누름 칸 찾기
export function cardOf(nickname) {
  const cards = RTL.screen.getAllByRole("button").filter((el) => el.getAttribute("aria-haspopup") === "menu")
  const card = cards.find((el) => el.textContent.includes(nickname))
  if (!card) throw new Error(`카드 없음: ${nickname}`)
  return card
}

// 지금 주소를 글로 보여 주는 부품 (주소 이동 확인용)
export function LocationText() {
  const location = useLocation()
  return h("p", { "data-testid": "location" }, location.pathname)
}
export { MemoryRouter, Routes, Route }
