// A18 점검 안내 화면 시험 몫 도우미: 점검 큰 안내(MaintenanceNotice)를 가짜 소켓·데이터 라우터와 그리고, 서버 점검 신호 값 만들기
// a18-maintenance 폴더 시험만 씀 (공용 아님), 시험 파일이 domSetup.mjs를 먼저 부른 뒤 await import로 부름
const K = await import("../a10-lobby-entry/a10Kit.mjs")
export const { React, RTL, createFakeSocket, flush } = K
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
const { default: MaintenanceNotice } = await import("../../src/domains/maintenance/components/MaintenanceNotice.jsx")
export const { useMaintenanceStore } = await import("../../src/domains/maintenance/store/maintenanceStore.js")

const h = React.createElement
export const MIN = 60 * 1000

// 앱처럼 라우터 옆에 점검 안내를 띄움 (앱은 router.navigate를 넘김), 주소는 path()로 읽음
export function renderNotice({ start = "/ingame" } = {}) {
  const socket = createFakeSocket()
  const router = createMemoryRouter([
    { path: "/lobby", element: h("p", null, "로비") },
    { path: "*", element: h("p", null, "판 화면") },
  ], { initialEntries: [start] })
  const view = RTL.render(h(React.Fragment, null,
    h(RouterProvider, { router }),
    h(MaintenanceNotice, { socket, navigate: (path, opts) => router.navigate(path, opts) }),
  ))
  return { ...view, socket, router, path: () => router.state.location.pathname }
}

// 서버가 보내는 maintenance_notice 값 (시각은 ms로 받아 글로 바꿈)
export function noticeOf({ state = "scheduled", startsAt = null, endsAt = null, serverNow, message = "" }) {
  const iso = (ms) => (ms === null ? null : new Date(ms).toISOString())
  return { state, message, startsAt: iso(startsAt), endsAt: iso(endsAt), serverNow: iso(serverNow), forceEndAtStart: true }
}

// 서버 알림 하나 받기 (화면 다시 그림까지)
export async function serverSays(socket, event, payload) {
  await RTL.act(async () => { socket.serverSays(event, payload) })
  await flush()
}

export const bigNotice = () => RTL.screen.queryByRole("alertdialog")
export const band = () => RTL.screen.queryByRole("region", { name: "점검 안내" })

export async function press(name) {
  await RTL.act(async () => { RTL.fireEvent.click(RTL.screen.getByRole("button", { name })) })
  await flush()
}

// 가짜 시계 넘기기 (1초 시계가 화면 값을 바꿔서 act 안에서)
export async function passTime(t, ms) {
  await RTL.act(async () => { t.mock.timers.tick(ms) })
  await flush()
}

export function resetAll() {
  RTL.cleanup()
  useMaintenanceStore.getState().reset()
}
