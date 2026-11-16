// 모바일 재판 창 채팅의 "죽은 사람끼리" 띠 시험: 죽은 사람 화면엔 있음(채팅방 띠와 같은 글·모양), 산 사람 화면엔 없음
// 목록 A06 모바일 A06-M-011·012 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-goG2-tribunal-dead-banner.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { flush } from "./a00-kit.mjs"
import { fakeSocket, fire, renderPage, resetGame, seat, tribunalBox, tribunalEntry } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 재판 창 채팅 칸 (피고 카드가 먼저 뜨고 1초 뒤 열림)
const tribunalChat = () => tribunalBox()?.querySelector('[aria-label="최후의 반론 채팅"]') ?? null
// 띠 글과 모양 → { text, look } (없으면 null), 어디 띠인지 root로 고름
const bannerOf = (root) => {
    const el = root?.querySelector("[data-dead-chat-banner]") ?? null
    return el ? { text: el.textContent.trim(), look: el.className } : null
}

// n명 판 1일 재판 화면 (피고 = 3번 자리, 나는 0번 자리), 재판 창 채팅이 열릴 때까지 기다림
async function tribunalChatPage({ n, dead = [] }) {
    const socket = fakeSocket()
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", dead })
    view = await renderPage(socket)
    // 재판 전 채팅방 띠 (죽은 사람이면 "죽은 사람끼리")
    const talkBanner = bannerOf(document.querySelector("[data-talk-list]"))
    await fire(socket, "day_vote_resolved", tribunalEntry({ n, defendant: 3 }))
    assert.ok(tribunalBox() !== null, "재판 창이 안 뜸 (준비 잘못)")
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)) })
    await flush()
    assert.ok(tribunalChat() !== null, "재판 창 채팅이 안 열림 (준비 잘못)")
    return { talkBanner }
}

test("A06-M-011 죽은 사람 재판 창 채팅 (7명 판): \"죽은 사람끼리\" 띠가 있고 채팅방 띠와 같은 글·모양", async () => {
    const { talkBanner } = await tribunalChatPage({ n: 7, dead: [0] })
    assert.equal(talkBanner?.text, "죽은 사람끼리", "채팅방 띠가 없음 (준비 잘못)")
    assert.deepEqual(bannerOf(tribunalChat()), talkBanner)
})

test("A06-M-012 산 사람 재판 창 채팅 (6명 판): \"죽은 사람끼리\" 띠 없음", async () => {
    await tribunalChatPage({ n: 6 })
    assert.equal(bannerOf(tribunalChat()), null)
    assert.equal(tribunalChat().textContent.includes("죽은 사람끼리"), false)
})
