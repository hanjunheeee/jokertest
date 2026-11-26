// 모바일 판 중 채팅 시험: 밤 산 귀족 입력 잠금, 역할 확인 10초 입력 잠금, 의사·죽은 시민 열림, 죽은 사람끼리 띠, 줄 모양, 시각 순, 재판 중 막기
// 목록 A06 모바일 A06-M-001~011 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-talk-chat.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"
import {
    NAMES, fakeSocket, fire, renderPage, resetGame, seat, shellBottom, tribunalBox, tribunalEntry, tribunalResolved,
} from "./a00-game.mjs"

const { buildTalkFeed } = await import("@m/domains/game/ingame/utils/talk/buildTalkFeed.js")
const { default: TalkBubble } = await import("@m/domains/game/ingame/components/talk/TalkBubble.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const chatInput = () => shellBottom()?.querySelector('textarea[aria-label="채팅 입력"]') ?? null
const talkList = () => document.querySelector("[data-talk-list]")
const chatSlot = () => document.querySelector('[data-talk-layout] [data-slot="chat"]')

// 6명 판 1일 밤 모바일 화면 (나는 0번 자리)
async function nightPage({ role, dead = false }) {
    const socket = fakeSocket()
    seat({ n: 6, role, allies: [], phase: "NIGHT", dead: dead ? [0] : [] })
    view = await renderPage(socket)
    return socket
}

test("A06-M-001 밤 산 귀족(시민) 입력 줄 잠금: 글칸 대신 '밤에는 귀족이 채팅을 쓸 수 없습니다' 안내 표시", async () => {
    await nightPage({ role: "CITIZEN" })
    assert.equal(chatInput(), null, "밤 산 귀족에게 입력칸이 열림")
    const closed = shellBottom()?.querySelector("[data-night-chat-closed]")
    assert.ok(closed, "밤 귀족 잠금 안내 줄이 없음")
    assert.equal(closed.getAttribute("role"), "status")
    assert.equal(textOf(closed), "밤에는 귀족이 채팅을 쓸 수 없습니다")
})

test("A06-M-011 역할 확인 단계 채팅 입력 잠금: 글칸과 보내기 단추가 disabled 상태", async () => {
    seat({ n: 6, role: "CITIZEN", phase: "ROLE_REVEAL", dayIndex: 0 })
    view = await renderPage(fakeSocket())
    const input = chatInput()
    assert.ok(input, "역할 확인 단계에 입력칸이 없음")
    assert.equal(input.disabled, true, "역할 확인 중인데 입력칸이 잠기지 않음")
    assert.ok(input.placeholder.includes("역할 확인"), `잠금 안내 placeholder가 아님: ${input.placeholder}`)
})

test("A06-M-002 밤 산 의사 입력 줄 열림: 글칸 있음", async () => {
    await nightPage({ role: "DOCTOR" })
    assert.ok(chatInput(), "밤 의사에게 글칸이 없음")
})

test("A06-M-003 [단위 2] 밤 죽은 시민 입력 줄 열림: 글칸 있음, 까닭 글 없음", async () => {
    await nightPage({ role: "CITIZEN", dead: true })
    assert.ok(chatInput(), "밤 죽은 시민에게 글칸이 없음")
    assert.ok(!textOf(shellBottom()).includes("밤에는 귀족이 채팅을 쓸 수 없습니다"), "죽은 시민에게 닫힘 까닭 글")
})

// "밤 · 같은 직업끼리" 띠는 2026-11-24 새 배치에서 없어짐 (사용자 결정 전) → 지금 코드대로 띠 없음, 같은 직업 채팅 글칸은 열림
test("A06-M-004 [지금 동작] 밤 의사 채팅방: '밤 · 같은 직업끼리' 띠 없음, 글칸은 열림", async () => {
    await nightPage({ role: "DOCTOR" })
    assert.ok(talkList(), "채팅방이 없음")
    assert.ok(!textOf(talkList()).includes("밤 · 같은 직업끼리"), `채팅방 머리: ${textOf(talkList()).slice(0, 80)}`)
    assert.ok(chatInput(), "밤 의사에게 글칸이 없음")
})

test("A06-M-005 [단위 2] 밤 산 시민 채팅방엔 '밤 · 같은 직업끼리' 띠 없음", async () => {
    await nightPage({ role: "CITIZEN" })
    assert.ok(talkList(), "채팅방이 없음")
    assert.ok(!textOf(talkList()).includes("밤 · 같은 직업끼리"), "시민 채팅방에 같은 직업 띠가 보임")
})

test("A06-M-006 죽은 사람 채팅방 '죽은 사람끼리' 띠: 죽은 사람 밤 → '죽은 사람끼리' 있음, '밤 · 같은 직업끼리' 없음", async () => {
    await nightPage({ role: "DOCTOR", dead: true })
    const text = textOf(talkList())
    assert.ok(text.includes("죽은 사람끼리"), `죽은 사람 띠가 없음: ${text.slice(0, 80)}`)
    assert.ok(!text.includes("밤 · 같은 직업끼리"), "죽은 사람에게 같은 직업 띠가 보임")
})

// 줄 하나를 말풍선으로 그려 바탕색(bg-[#rrggbb]) 꺼내기
function bubbleColorOf(channel) {
    const [line] = buildTalkFeed({ messages: [{ id: `m-${channel}`, playerId: "p1", senderName: NAMES[1], text: "안녕", sentAt: 1_000, channel }], localPlayerId: "p0" })
    const drawn = render(React.createElement("ul", null, React.createElement(TalkBubble, { line, groupStart: true, player: null, themeColor: null, showTime: false })))
    const bubble = [...drawn.container.querySelectorAll("p")].find((p) => p.textContent === "안녕")
    const hex = bubble?.className.match(/bg-\[#([0-9a-f]{6})\]/i)?.[1] ?? null
    drawn.unmount()
    return hex
}
const isGray = (hex) => hex !== null && hex.slice(0, 2) === hex.slice(2, 4) && hex.slice(2, 4) === hex.slice(4, 6)

test("A06-M-007 줄 모양: 채널 DOCTOR 줄 → 같은 직업 말풍선 모양 (낮 말풍선과 다름, 광대 채널과 같음)", () => {
    const day = bubbleColorOf("DAY")
    const doctor = bubbleColorOf("DOCTOR")
    const joker = bubbleColorOf("JOKER")
    assert.ok(day && doctor, "말풍선 바탕색을 못 읽음")
    assert.notEqual(doctor, day, "같은 직업 줄이 낮 말풍선과 같음")
    assert.equal(doctor, joker, "의사 채널 줄이 같은 직업(광대) 말풍선 모양과 다름")
})

test("A06-M-008 줄 모양: 채널 DEAD 줄 → 회색 모양", () => {
    const dead = bubbleColorOf("DEAD")
    assert.ok(isGray(dead), `죽은 사람 줄 바탕이 회색이 아님: #${dead}`)
    assert.notEqual(dead, bubbleColorOf("DAY"))
})

test("A06-M-009 말·알림·이모티콘이 시각 순으로 한 목록: 말 2·알림 1·이모티콘 1 엇갈린 시각 → 시각 순 4줄", () => {
    const lines = buildTalkFeed({
        messages: [
            { id: "a", playerId: "p1", senderName: NAMES[1], text: "첫 말", sentAt: 4_000 },
            { id: "b", playerId: "p2", senderName: NAMES[2], text: "둘째 말", sentAt: 1_000 },
        ],
        notices: [{ id: "n1", at: 3_000, text: `${NAMES[3]}님이 죽었습니다` }],
        emojis: [{ id: "e1", at: 2_000, playerId: "p4", itemId: "emoji-basic-love" }],
        localPlayerId: "p0",
        nameOf: (id) => NAMES[Number(id.slice(1))],
    })
    assert.deepEqual(lines.map((l) => `${l.kind}@${l.at}`), ["chat@1000", "emoji@2000", "system@3000", "chat@4000"])
})

test("A06-M-010 재판 중 채팅방은 막기만 (8명): 재판 시작 → 채팅방 그대로(빠지지 않음)·연출 동안 눌리지 않음, 재판 끝 → 그사이 온 처형 알림 줄 있음", async () => {
    const socket = fakeSocket()
    seat({ n: 8, phase: "DAY", dayPhase: "DAY_VOTE", deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    const listBefore = talkList()
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 8, defendant: 5 }))
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    assert.ok(chatSlot()?.hasAttribute("inert"), "연출 중 채팅방이 눌림(inert 아님)")
    assert.ok(talkList() === listBefore, "재판 중 채팅방이 빠졌다가 새로 그려짐")
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 5, outcome: "GUILTY" }))
    assert.ok(!chatSlot().hasAttribute("inert"), "재판 뒤에도 채팅방이 막힘")
    assert.ok(talkList() === listBefore, "재판 뒤 채팅방이 새로 그려짐")
    assert.ok(textOf(talkList()).includes(`${NAMES[5]}님이 죽었습니다`), `처형 알림 줄이 없음: ${textOf(talkList())}`)
})
