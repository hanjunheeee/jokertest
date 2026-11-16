// 관리자 화면 A14 시험 같이 쓰는 도우미, 화면 열기·답 흘려 보내기·서버 답 모양·버튼 찾기
// tests/admin/a14-*.test.js가 맨 위에서 부름 (adminDom.mjs를 먼저 불러 가짜 화면부터 깜)
import { createFakeServer, ME_OK, setScreenWidth } from "./helpers/adminDom.mjs"

const React = await import("react")
const RTL = await import("@testing-library/react")
const Router = await import("react-router-dom")

export const h = React.createElement
export const { render, screen, fireEvent, cleanup, act, within } = RTL
export const { MemoryRouter, Routes, Route } = Router
export { createFakeServer, ME_OK, setScreenWidth }

// 마이크로 작업 흘려 보내기 (가짜 서버 답이 화면에 닿게)
export async function settle(times = 10) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// 주소 하나로 화면 열기: path 있으면 그 경로 틀에 붙임 (예: "/reports/*")
export async function openAt(entry, element, path = null) {
  const inner = path ? h(Routes, null, h(Route, { path, element })) : element
  const view = render(h(MemoryRouter, { initialEntries: [entry] }, inner))
  await settle()
  return view
}

// 칸에 글 넣기
export async function type(field, value) {
  await act(async () => { fireEvent.change(field, { target: { value } }) })
}

// 누르고 답 흘려 보내기
export async function press(element) {
  await act(async () => { fireEvent.click(element) })
  await settle()
}

// 이름으로 버튼 찾기 (없으면 null) — 비교엔 노드 통째 말고 참거짓만 씀
export const buttonNamed = (name, root = document.body) => within(root).queryByRole("button", { name }) ?? null
export const dialog = () => screen.queryByRole("dialog")
export const bodyText = () => document.body.textContent
// 위험 표시: 빨간 버튼 class 또는 data-danger
export const isDanger = (button) => /(^|\s)bg-danger(\s|$)/.test(button.className) || button.hasAttribute("data-danger")
// 가짜 서버에 쌓인 요청 중 고른 것
export const callsOf = (server, method, url) => server.calls.filter((c) => c.method === method && (url instanceof RegExp ? url.test(c.url) : c.url === url))

// 시험 회원 (가짜 uuid, 이메일은 실제 서버 가림 모양 a***c@e***.com)
export const MEMBER_UUID = "a14f0000-0000-4000-8000-000000000001"
export const memberOf = (over = {}) => ({
  uuid: MEMBER_UUID, nickname: "가면1", emailMasked: "a***c@e***.com", status: "ACTIVE", role: "USER",
  online: false, onlineNode: null, withdrawn: false,
  createdAt: "2026-11-01T00:00:00.000Z", lastLoginAt: "2026-11-15T00:00:00.000Z",
  ...over,
})
export const detailOf = (over = {}) => ({
  ok: true, member: memberOf(), bans: [], reportsReceived: [], logins: [], desertions: [], ...over,
})
export const EMPTY_WALLET = { ok: true, gold: 0, diamond: 0, ledger: [] }

// 회원 상세 화면 열기 (지갑 칸 답까지)
export async function openMemberDetail({ detail = detailOf(), wallet = EMPTY_WALLET } = {}) {
  const server = createFakeServer()
  server.answer(`GET /admin-api/members/${MEMBER_UUID}`, 200, detail)
  server.answer(`GET /admin-api/members/${MEMBER_UUID}/wallet`, 200, wallet)
  const { default: MemberDetailPage } = await import("../../src/admin/domains/members/pages/MemberDetailPage.jsx")
  await openAt(`/members/${MEMBER_UUID}`, h(MemberDetailPage), "/members/:uuid")
  return server
}
