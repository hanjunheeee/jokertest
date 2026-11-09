// 빈칸 채우기 시험: 멀티 입구(/multiplay) 버튼이 맞는 주소로 보내는지 — 빈칸찾기 하 14
// 방 목록 훅(소켓)만 가짜로, 방 목록 셸·줄·뒤로 가기 줄은 진짜로 그림
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { createElement } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const srcUrl = (rel) => new URL(`../../../../src/${rel}`, import.meta.url).href

// 이동 기록 · 공개 방 들어가기 기록 (시험마다 비움)
const navigations = []
const joined = []
let fakeRooms = []

const { mock } = await import("node:test")
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (to, options) => navigations.push({ to, state: options?.state ?? null }) },
})
mock.module(srcUrl("domains/game/mode/hooks/usePublicRooms.js"), {
  namedExports: { usePublicRooms: () => ({ rooms: fakeRooms, joinPublicRoom: (id) => joined.push(id), isJoining: false }) },
})

const { render, fireEvent, cleanup, screen } = await import("@testing-library/react")
const { default: MultiplayEntryPage } = await import(srcUrl("domains/game/mode/pages/MultiplayEntryPage.jsx"))

// 방 하나 (목록 줄이 읽는 칸만)
const room = (id, accessType, extra = {}) => ({
  id, title: `방 ${id}`, current: 2, max: 5, status: "waiting", accessType, stage: 1, settings: {}, ...extra,
})

function open(rooms = []) {
  navigations.length = 0
  joined.length = 0
  fakeRooms = rooms
  return render(createElement(MultiplayEntryPage))
}

test.afterEach(() => cleanup())

test("방 만들기를 누르면 → /game-setup 으로 감", () => {
  open()
  fireEvent.click(screen.getByRole("button", { name: "방 만들기" }))
  assert.deepEqual(navigations, [{ to: "/game-setup", state: null }])
})

test("코드로 참가를 누르면 → /roomInvite 로 감 (고른 방 없음 → state 없음)", () => {
  open()
  fireEvent.click(screen.getByRole("button", { name: "코드로 참가" }))
  assert.deepEqual(navigations, [{ to: "/roomInvite", state: null }])
})

test("뒤로 가기를 누르면 → /gameMode 로 감", () => {
  open()
  fireEvent.click(screen.getByRole("button", { name: "게임 모드 선택으로 돌아가기" }))
  assert.deepEqual(navigations, [{ to: "/gameMode", state: null }])
})

test("코드 방을 고르고 입장을 누르면 → 그 방 id를 들고 /roomInvite 로 감", () => {
  open([room("r-code", "code")])
  fireEvent.click(screen.getByRole("button", { pressed: false, name: /방 r-code/ }))
  fireEvent.click(screen.getByRole("button", { name: "코드 입력" }))
  assert.deepEqual(navigations, [{ to: "/roomInvite", state: { roomId: "r-code" } }])
  assert.deepEqual(joined, [])
})

test("공개 방을 고르고 입장을 누르면 → 주소 이동 없이 그 방 들어가기 요청", () => {
  open([room("r-open", "open")])
  fireEvent.click(screen.getByRole("button", { pressed: false, name: /방 r-open/ }))
  fireEvent.click(screen.getByRole("button", { name: "선택한 방 입장" }))
  assert.deepEqual(joined, ["r-open"])
  assert.deepEqual(navigations, [])
})

test("방을 안 골랐으면 → 입장 버튼이 잠겨 있음", () => {
  open([room("r-open", "open")])
  assert.equal(screen.getByRole("button", { name: "선택한 방 입장" }).disabled, true)
})
