// 모바일 채팅 줄 이름 띠 시험: 채팅 틀 줄·재판 창 줄·채팅방 말풍선 모두 이름에만 그 사람 색 + 띠, 말은 기본 글자색, 설정 끄면 띠 없음, 죽은 사람 줄은 회색 이름 띠
// 재판 창 채팅 오류 글은 입력 줄 위 나무 띠 위에 흰 글 (양피지 아래 어두운 자리에서 안 읽혀서)
// 목록 A06 모바일 A06-M-013~018 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-bug2-chat-name-band.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const { INGAME_PLAYER_THEME_PALETTE } = await import("@/shared/constants/ingamePlayerTheme.js")
const { pickNameplateBand } = await import("@/domains/game/ingame/utils/nameplateBand.js")
const { DEAD_CHAT_NAME_COLOR } = await import("@/domains/game/ingame/utils/chatNameBand.js")
const { InGamePlayerSessionContext } = await import("@/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { useSettingsStore } = await import("@/domains/settings/store/settingsStore.js")
const { default: MessageRow } = await import("@m/domains/game/ingame/components/chat/MessageRow.jsx")
const { default: TribunalChatRow } = await import("@m/domains/game/ingame/components/overlays/tribunal/TribunalChatRow.jsx")
const { default: TribunalChat } = await import("@m/domains/game/ingame/components/overlays/tribunal/TribunalChat.jsx")
const { default: TalkBubble } = await import("@m/domains/game/ingame/components/talk/TalkBubble.jsx")

const h = React.createElement
const firstChatChecks = useSettingsStore.getState().chatChecks
let drawn = null
afterEach(() => {
    drawn?.unmount()
    drawn = null
    useSettingsStore.setState({ chatChecks: firstChatChecks })
})

// 남색(9번) — 밝은 띠를 고르는 짙은 색
const NAVY = INGAME_PLAYER_THEME_PALETTE[9].color
// "#101e85" → "rgb(16, 30, 133)"
const rgbText = (hex) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.replace("#", "").slice(at, at + 2), 16)).join(", ")})`
const bandIn = (root) => root.querySelector("[data-chat-name-band]")
// 줄의 말 칸 (줄의 마지막 칸)
const bodyIn = (li) => [...li.querySelectorAll("span")].at(-1)
const show = (element) => {
    drawn = render(h("ul", null, element))
    return drawn.container.querySelector("li")
}
const message = (channel = "DAY") => ({ id: "m1", playerId: "p9", senderName: "주원", text: "안녕", sentAt: 1_000, channel })

test("A06-M-013 채팅 틀 줄(MessageRow): 색 켬 → 이름은 그 사람 색 띠 칸 안, 말 칸엔 색 없음", () => {
    const li = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: true, showTime: false }))
    const band = bandIn(li)
    assert.equal(band?.textContent, "주원")
    assert.equal(band.style.color, rgbText(NAVY))
    assert.equal(band.getAttribute("data-chat-name-band"), pickNameplateBand(NAVY))
    assert.equal(bodyIn(li).style.color, "")
    assert.equal(li.textContent, "주원:\"안녕\"")
})

test("A06-M-014 채팅 틀 줄: 색 끔 → 띠 없음, 이름·말 모두 기본색 / 죽은 사람 줄 → 회색 이름 띠, 말 기본색", () => {
    const off = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: false, showTime: false }))
    assert.equal(bandIn(off), null)
    for (const span of off.querySelectorAll("span")) assert.equal(span.style.color, "")
    drawn.unmount()
    const dead = show(h(MessageRow, { message: message("DEAD"), themeStyles: { color: NAVY }, nicknameColor: true, showTime: false }))
    assert.equal(bandIn(dead)?.style.color, rgbText(DEAD_CHAT_NAME_COLOR))
    assert.equal(bodyIn(dead).style.color, "")
})

// 재판 창 줄은 설정 스토어·참가자 컨텍스트에서 색을 꺼냄
const sessionWith = (color) => ({ getThemeStylesByPlayerId: (id) => (id === "p9" ? { color } : null) })
const tribunalRow = (props) => h(InGamePlayerSessionContext.Provider, { value: sessionWith(NAVY) }, h(TribunalChatRow, { playerId: "p9", senderName: "주원", text: "반론", ...props }))

test("A06-M-015 재판 창 줄(TribunalChatRow): 색 켬 → 이름 띠, 말 기본색 / 죽은 사람 줄 → 회색 이름 띠", () => {
    const li = show(tribunalRow({}))
    assert.equal(bandIn(li)?.style.color, rgbText(NAVY))
    assert.equal(bodyIn(li).style.color, "")
    drawn.unmount()
    const dead = show(tribunalRow({ channel: "DEAD" }))
    assert.equal(bandIn(dead)?.style.color, rgbText(DEAD_CHAT_NAME_COLOR))
})

test("A06-M-016 재판 창 줄: \"닉네임 색상 표시\" 끔 → 띠 없음, 모든 칸 기본색", () => {
    useSettingsStore.setState({ chatChecks: { ...firstChatChecks, "nickname-color": false } })
    const li = show(tribunalRow({}))
    assert.equal(bandIn(li), null)
    for (const span of li.querySelectorAll("span")) assert.equal(span.style.color, "")
})

test("A06-M-017 채팅방 말풍선(TalkBubble) 닉네임: 테마 색 그대로 띠 칸 안 (섞은 색 아님), 색 없으면 띠 없음", () => {
    const line = { id: "l1", kind: "text", mine: false, name: "주원", text: "안녕", at: 1_000 }
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: NAVY, showTime: false })))
    const band = bandIn(drawn.container)
    assert.equal(band?.textContent, "주원")
    assert.equal(band.style.color, rgbText(NAVY))
    assert.equal(band.getAttribute("data-chat-name-band"), pickNameplateBand(NAVY))
    drawn.unmount()
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: null, showTime: false })))
    assert.equal(bandIn(drawn.container), null)
})

test("A06-M-018 재판 창 채팅 오류 글 → 입력 줄의 나무 띠 위 흰 글(role=alert), 양피지 목록 칸 안엔 없음", () => {
    drawn = render(h(TribunalChat, { draft: "", messages: [], error: "메시지는 150자 이하로 입력해주세요." }))
    const alert = drawn.container.querySelector('[role="alert"]')
    assert.equal(alert?.textContent, "메시지는 150자 이하로 입력해주세요.")
    assert.equal(alert.closest('[role="log"]') === null && alert.parentElement.parentElement.querySelector("textarea") !== null, true, "입력 줄 안이 아님")
    assert.match(alert.className, /\btext-white\b/)
})
