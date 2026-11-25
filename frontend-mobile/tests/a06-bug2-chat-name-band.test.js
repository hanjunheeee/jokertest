// 모바일 채팅 줄 글자색 시험: 채팅 틀 줄·재판 창 줄은 이름·말 모두 그 사람 테마 색(설정 끄면 기본색), 죽은 사람 줄은 회색, 채팅방 말풍선 이름은 테마 색에 양피지색을 섞은 색
// 재판 창 채팅 오류·전송 중 글은 목록 칸 아래 한 줄 (지금 화면), 이름 띠(data-chat-name-band)는 지금 화면에 없음
// 목록 A06 모바일 A06-M-013~018 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-bug2-chat-name-band.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const { INGAME_PLAYER_THEME_PALETTE } = await import("@/shared/constants/ingamePlayerTheme.js")
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

// 남색(9번) 테마
const NAVY = INGAME_PLAYER_THEME_PALETTE[9].color
// "#101e85" → "rgb(16, 30, 133)"
const rgbText = (hex) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.replace("#", "").slice(at, at + 2), 16)).join(", ")})`
// 줄의 이름 칸·말 칸 (시각 끈 줄은 칸 2개: 이름, 말)
const spansOf = (li) => [...li.querySelectorAll("span")]
const colorsOf = (li) => spansOf(li).map((span) => span.style.color)
const show = (element) => {
    drawn = render(h("ul", null, element))
    return drawn.container.querySelector("li")
}
const message = (channel = "DAY") => ({ id: "m1", playerId: "p9", senderName: "주원", text: "안녕", sentAt: 1_000, channel })

test("A06-M-013 채팅 틀 줄(MessageRow): 색 켬 → 이름·말 둘 다 그 사람 테마 색, 글 '주원:\"안녕\"', 이름 띠 없음", () => {
    const li = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: true, showTime: false }))
    assert.deepEqual(colorsOf(li), [rgbText(NAVY), rgbText(NAVY)])
    assert.equal(li.textContent, "주원:\"안녕\"")
    assert.equal(li.querySelector("[data-chat-name-band]"), null)
})

test("A06-M-014 채팅 틀 줄: 색 끔 → 이름·말 모두 기본색 / 죽은 사람 줄 → 색 켜도 이름·말 모두 회색(#a9a9a9)", () => {
    const off = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: false, showTime: false }))
    assert.deepEqual(colorsOf(off), ["", ""])
    drawn.unmount()
    const dead = show(h(MessageRow, { message: message("DEAD"), themeStyles: { color: NAVY }, nicknameColor: true, showTime: false }))
    assert.deepEqual(colorsOf(dead), [rgbText("#a9a9a9"), rgbText("#a9a9a9")])
})

// 재판 창 줄은 설정 스토어·참가자 컨텍스트에서 색을 꺼냄
const sessionWith = (color) => ({ getThemeStylesByPlayerId: (id) => (id === "p9" ? { color } : null) })
const tribunalRow = (props) => h(InGamePlayerSessionContext.Provider, { value: sessionWith(NAVY) }, h(TribunalChatRow, { playerId: "p9", senderName: "주원", text: "반론", ...props }))

test("A06-M-015 재판 창 줄(TribunalChatRow): 색 켬 → 이름·말 둘 다 테마 색 / 테마 없는 사람 줄 → 기본색", () => {
    const li = show(tribunalRow({}))
    assert.deepEqual(colorsOf(li), [rgbText(NAVY), rgbText(NAVY)])
    assert.equal(li.textContent, "주원:\"반론\"")
    drawn.unmount()
    const other = show(tribunalRow({ playerId: "p-none" }))
    assert.deepEqual(colorsOf(other), ["", ""])
})

test("A06-M-016 재판 창 줄: \"닉네임 색상 표시\" 끔 → 모든 칸 기본색", () => {
    useSettingsStore.setState({ chatChecks: { ...firstChatChecks, "nickname-color": false } })
    const li = show(tribunalRow({}))
    assert.ok(spansOf(li).length >= 2, "이름·말 칸이 없음")
    for (const span of spansOf(li)) assert.equal(span.style.color, "")
})

// 말풍선 이름 색은 color-mix(테마 60% + #fff1d6) — 어두운 채팅방에서 짙은 테마도 읽히게 (style 글 그대로 봄)
test("A06-M-017 채팅방 말풍선(TalkBubble) 닉네임: 테마 색을 양피지색과 섞은 색, 색 없으면 기본색, 이름 띠 없음", () => {
    const line = { id: "l1", kind: "chat", mine: false, name: "주원", text: "안녕", at: 1_000 }
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: NAVY, showTime: false })))
    const name = [...drawn.container.querySelectorAll("p")].find((p) => p.textContent === "주원")
    assert.ok(name, "이름 줄이 없음")
    // jsdom은 16진 색을 rgb()로 바꿔 적음 → 예: "color: color-mix(in srgb, rgb(16, 30, 133) 60%, rgb(255, 241, 214));"
    const style = name.getAttribute("style") ?? ""
    assert.ok(style.includes(`color-mix(in srgb, ${rgbText(NAVY)} 60%, ${rgbText("#fff1d6")})`), `이름 글자색: ${style}`)
    assert.equal(drawn.container.querySelector("[data-chat-name-band]"), null)
    drawn.unmount()
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: null, showTime: false })))
    const plain = [...drawn.container.querySelectorAll("p")].find((p) => p.textContent === "주원")
    assert.equal(plain.getAttribute("style"), null)
})

test("A06-M-018 재판 창 채팅 상태 글: 오류 → 목록 칸 아래 그 글(오류가 전송 중보다 먼저), 전송 중 → '전송 중', 없으면 줄 없음", () => {
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: "sending", error: "메시지는 150자 이하로 입력해주세요." }))
    const log = drawn.container.querySelector('[role="log"]')
    const line = log.parentElement.querySelector(":scope > p")
    assert.equal(line?.textContent, "메시지는 150자 이하로 입력해주세요.")
    assert.equal(log.textContent.includes("150자"), false, "오류 글이 말 목록 안에 들어감")
    drawn.unmount()
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: "sending", error: null }))
    assert.equal(drawn.container.querySelector('[role="log"]').parentElement.querySelector(":scope > p")?.textContent, "전송 중")
    drawn.unmount()
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: null, error: null }))
    assert.equal(drawn.container.querySelector('[role="log"]').parentElement.querySelector(":scope > p"), null)
})
