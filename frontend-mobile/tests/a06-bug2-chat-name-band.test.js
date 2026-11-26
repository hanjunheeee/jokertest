// 모바일 채팅 줄 이름 띠·본문 기본색·죽은 사람끼리 배지 시험: 이름만 테마 색+배경 띠, 말 본문은 기본 글자색, 죽은 사람 채널 회색 이름 띠
// 목록 A06 모바일 A06-M-013~019 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-bug2-chat-name-band.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const { INGAME_PLAYER_THEME_PALETTE } = await import("@/shared/constants/ingamePlayerTheme.js")
const { InGamePlayerSessionContext } = await import("@/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { useInGameStore } = await import("@/domains/game/ingame/store/ingameStore.js")
const { useSettingsStore } = await import("@/domains/settings/store/settingsStore.js")
const { default: MessageRow } = await import("@m/domains/game/ingame/components/chat/MessageRow.jsx")
const { default: CloseupSheet } = await import("@m/domains/game/ingame/components/chat/CloseupSheet.jsx")
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
    useInGameStore.getState().clearGame()
})

// 남색(9번) 테마
const NAVY = INGAME_PLAYER_THEME_PALETTE[9].color
// "#101e85" → "rgb(16, 30, 133)"
const rgbText = (hex) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.replace("#", "").slice(at, at + 2), 16)).join(", ")})`
const show = (element) => {
    drawn = render(h("ul", null, element))
    return drawn.container.querySelector("li")
}
const message = (channel = "DAY") => ({ id: "m1", playerId: "p9", senderName: "주원", text: "안녕", sentAt: 1_000, channel })
const bodySpanOf = (li) => li.querySelector('span[aria-readonly="true"]')

test("A06-M-013 채팅 틀 줄(MessageRow): 색 켬 → 이름에만 테마 색+밝은 띠, 말 본문은 기본 글자색(인라인 색 없음)", () => {
    const li = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: true, showTime: false }))
    const band = li.querySelector("[data-chat-name-band]")
    assert.ok(band, "이름 띠가 없음")
    assert.equal(band.textContent, "주원")
    assert.equal(band.style.color, rgbText(NAVY))
    assert.equal(band.getAttribute("data-chat-name-band"), "light")
    assert.equal(bodySpanOf(li)?.style.color, "", "말 본문에 테마 색이 남음")
    assert.equal(li.textContent, "주원:\"안녕\"")
})

test("A06-M-014 채팅 틀 줄: 색 끔 → 띠 없이 기본색 / 죽은 사람 줄 → 설정과 무관하게 회색(#a9a9a9) 이름 띠, 본문은 기본색", () => {
    const off = show(h(MessageRow, { message: message(), themeStyles: { color: NAVY }, nicknameColor: false, showTime: false }))
    assert.equal(off.querySelector("[data-chat-name-band]"), null)
    assert.equal(bodySpanOf(off)?.style.color, "")
    drawn.unmount()
    const dead = show(h(MessageRow, { message: message("DEAD"), themeStyles: { color: NAVY }, nicknameColor: false, showTime: false }))
    const band = dead.querySelector("[data-chat-name-band]")
    assert.ok(band, "죽은 사람 줄 이름 띠가 없음")
    assert.equal(band.style.color, rgbText("#a9a9a9"))
    assert.equal(bodySpanOf(dead)?.style.color, "")
})

// 재판 창 줄은 설정 스토어·참가자 컨텍스트에서 색을 꺼냄
const sessionWith = (color) => ({ getThemeStylesByPlayerId: (id) => (id === "p9" ? { color } : null) })
const tribunalRow = (props) => h(InGamePlayerSessionContext.Provider, { value: sessionWith(NAVY) }, h(TribunalChatRow, { playerId: "p9", senderName: "주원", text: "반론", ...props }))

test("A06-M-015 재판 창 줄(TribunalChatRow): 색 켬 → 이름에만 테마 띠, 본문 기본색 / 죽은 사람 채널 전달 시 회색 이름 띠", () => {
    const li = show(tribunalRow({}))
    const band = li.querySelector("[data-chat-name-band]")
    assert.ok(band, "재판 줄 이름 띠가 없음")
    assert.equal(band.style.color, rgbText(NAVY))
    assert.equal(li.lastElementChild.style.color, "", "재판 말 본문에 테마 색이 남음")
    assert.equal(li.textContent, "주원:\"반론\"")
    drawn.unmount()
    const dead = show(tribunalRow({ channel: "DEAD" }))
    assert.equal(dead.querySelector("[data-chat-name-band]")?.style.color, rgbText("#a9a9a9"))
})

test("A06-M-016 재판 창 줄: \"닉네임 색상 표시\" 끔 → 이름 띠 없이 모든 칸 기본색", () => {
    useSettingsStore.setState({ chatChecks: { ...firstChatChecks, "nickname-color": false } })
    const li = show(tribunalRow({}))
    assert.equal(li.querySelector("[data-chat-name-band]"), null)
    for (const span of li.querySelectorAll("span")) assert.equal(span.style.color, "")
})

// 말풍선 이름 색은 color-mix(테마 60% + #fff1d6) — 어두운 채팅방에서 짙은 테마도 읽히게 (style 글 그대로 봄)
test("A06-M-017 채팅방 말풍선(TalkBubble) 닉네임: 테마 색을 양피지색과 섞은 색, 색 없으면 기본색, 이름 띠 없음", () => {
    const line = { id: "l1", kind: "chat", mine: false, name: "주원", text: "안녕", at: 1_000 }
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: NAVY, showTime: false })))
    const name = [...drawn.container.querySelectorAll("p")].find((p) => p.textContent === "주원")
    assert.ok(name, "이름 줄이 없음")
    const style = name.getAttribute("style") ?? ""
    assert.ok(style.includes(`color-mix(in srgb, ${rgbText(NAVY)} 60%, ${rgbText("#fff1d6")})`), `이름 글자색: ${style}`)
    assert.equal(drawn.container.querySelector("[data-chat-name-band]"), null)
    drawn.unmount()
    drawn = render(h("ul", null, h(TalkBubble, { line, groupStart: true, player: null, themeColor: null, showTime: false })))
    const plain = [...drawn.container.querySelectorAll("p")].find((p) => p.textContent === "주원")
    assert.equal(plain.getAttribute("style"), null)
})

test("A06-M-018 재판 창 채팅 상태 줄: 오류 → StatusLine에 그 글(오류가 전송 중보다 먼저), 전송 중 → '전송 중', 없으면 비어 있음", () => {
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: "sending", error: "메시지는 150자 이하로 입력해주세요." }))
    const log = drawn.container.querySelector('[role="log"]')
    const line = drawn.container.querySelector("[data-ingame-chat-status-line]")
    assert.equal(line?.textContent, "메시지는 150자 이하로 입력해주세요.")
    assert.equal(log.textContent.includes("150자"), false, "오류 글이 말 목록 안에 들어감")
    drawn.unmount()
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: "sending", error: null }))
    assert.equal(drawn.container.querySelector("[data-ingame-chat-status-line]")?.textContent, "전송 중")
    drawn.unmount()
    drawn = render(h(TribunalChat, { draft: "", messages: [], status: null, error: null }))
    assert.equal(drawn.container.querySelector("[data-ingame-chat-status-line]")?.textContent ?? "", "")
})

test("A06-M-019 재판 채팅·크게 보기 창 죽은 사람 채널 '죽은 사람끼리' 배지 표시", () => {
    const session = { players: [], localPlayerId: "p0", getThemeStylesByPlayerId: () => null }
    const chatSession = { draft: "", messages: [], status: null, error: null, isDeadChat: true }
    drawn = render(
        h(
            InGamePlayerSessionContext.Provider,
            { value: session },
            h(React.Fragment, null,
                h(TribunalChat, { draft: "", messages: [], status: null, error: null, isDeadChat: true }),
                h(CloseupSheet, { open: true, onClose: () => {}, session: chatSession }),
            ),
        ),
    )
    assert.equal(drawn.container.querySelector("[data-dead-chat-badge]")?.textContent, "죽은 사람끼리")
    assert.equal(document.querySelector('[role="dialog"][aria-label="채팅 클로즈업"] [data-dead-chat-badge]')?.textContent, "죽은 사람끼리")
})
