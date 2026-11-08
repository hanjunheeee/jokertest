// 카톡형 채팅방 위 띠 시험 (사용자 결정 2026-11-09): 죽은 뒤엔 "죽은 사람끼리" 회색 띠·회색 말풍선, 밤 산 사람은 "밤 · 같은 직업끼리"
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, React } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

stubModule("/hooks/talk/useTalkFeed.js", "export function useTalkFeed() { return globalThis.__talkFeed }")
stubModule("/hooks/talk/useStickToBottom.js", "export function useStickToBottom() { return { unseen: false, scrollToBottom: () => {} } }")
stubModule("/hooks/chat/useChatDisplaySettings.js", "export function useChatDisplaySettings() { return { textScale: 1, showTime: false, nicknameColor: false } }")
stubModule("/components/InGamePlayerSessionContext.js",
    "export function useInGamePlayerSessionContext() { return { getPlayerById: () => null, getThemeStylesByPlayerId: () => null } }")
const { default: TalkList } = await import("@m/domains/game/ingame/components/talk/TalkList.jsx")

function show(feed) {
    globalThis.__talkFeed = { session: { status: "idle", error: null }, ...feed }
    return render(React.createElement(TalkList))
}

const deadLine = { kind: "chat", id: "chat-1", at: 1, playerId: "b", name: "죽은이", text: "죽은 말", mine: false, joker: false, dead: true }

test("죽은 뒤: '죽은 사람끼리' 띠, 밤 같은 직업 띠는 안 보임, 죽은 사람 말풍선은 회색", () => {
    const view = show({ lines: [deadLine], joker: false, dead: true })
    const banner = view.container.querySelector("[data-dead-chat-banner]")
    assert.ok(banner)
    assert.equal(banner.textContent, "죽은 사람끼리")
    assert.equal(view.container.textContent.includes("밤 · 같은 직업끼리"), false)
    const bubbles = [...view.container.querySelectorAll("li[data-talk-line] p")]
    assert.ok(bubbles.some((node) => node.className.includes("bg-[#3a3a3a]")), "회색 말풍선이 없음")
    view.unmount()
})

test("밤 산 사람: '밤 · 같은 직업끼리' 띠만", () => {
    const view = show({ lines: [], joker: true, dead: false })
    assert.equal(view.container.querySelector("[data-dead-chat-banner]"), null)
    assert.ok(view.container.textContent.includes("밤 · 같은 직업끼리"))
    view.unmount()
})
