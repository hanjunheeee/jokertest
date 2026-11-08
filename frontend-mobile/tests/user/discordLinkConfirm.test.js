// Discord 연결 확인 창 시험 (MO-029), 기본 confirm 대신 양피지 확인 창: 연결 누르면 이동, 취소면 그대로
// 연결 시작·소리는 바꿔 끼움 (진짜 주소 이동·소리 안 냄)
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, act, React } from "../helpers/dom.mjs"
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

stubModule(
    "/frontend/src/domains/user/hooks/useDiscordAccountLink.js",
    `export const resolveDiscordLinkMessage = () => null
export const startDiscordLink = async (url) => { globalThis.__discordStarts.push(url) }`,
)
stubModule(
    "/frontend/src/shared/hooks/useSfxRuntime.js",
    `export const dispatchUiSfx = (kind) => { globalThis.__sfx.push(kind) }`,
)

const { MemoryRouter } = await import("react-router-dom")
const { default: DiscordSection } = await import("@m/domains/user/components/account/DiscordSection.jsx")

beforeEach(() => {
    globalThis.__discordStarts = []
    globalThis.__sfx = []
    window.confirm = () => { throw new Error("기본 confirm 창을 씀") }
})

function mount() {
    return render(React.createElement(MemoryRouter, { initialEntries: ["/account"] }, React.createElement(DiscordSection)))
}

const dialog = () => document.body.querySelector('[data-discord-link-confirm] [role="dialog"]')
const buttonByLabel = (label) => [...document.body.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label)

function pressLink(view) {
    const form = view.container.querySelector("form")
    act(() => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })))
}

test("연결하기 누르면 양피지 확인 창이 뜨고, 아직 이동 안 함", () => {
    const view = mount()
    assert.equal(dialog(), null)
    pressLink(view)
    assert.ok(dialog(), "확인 창이 안 뜸")
    assert.match(dialog().textContent, /Discord 계정을 이 계정에 연결하시겠습니까\?/)
    assert.deepEqual(globalThis.__discordStarts, [])
    view.unmount()
})

test("확인 창에서 연결 누르면 서버 연결 주소로 이동", () => {
    const view = mount()
    pressLink(view)
    act(() => buttonByLabel("연결").click())
    assert.equal(globalThis.__discordStarts.length, 1)
    assert.match(globalThis.__discordStarts[0], /\/auth\/discord\/link\?client=mobile$/)
    assert.equal(dialog(), null)
    view.unmount()
})

test("확인 창에서 취소 누르면 닫히고 이동 안 함", () => {
    const view = mount()
    pressLink(view)
    act(() => buttonByLabel("취소").click())
    assert.equal(dialog(), null)
    assert.deepEqual(globalThis.__discordStarts, [])
    view.unmount()
})
