// 모바일 재판 중 채팅방·단계 줄·처형 알림 시험: 채팅방은 숨기기만(빠지지 않음), "5초 뒤 마감" 줄, 처형 직업·표 수는 안 보임
// 목록 A04 모바일 A04-M-009·010·012 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-tribunal-talk.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { textOf, waitUntil } from "./a00-kit.mjs"
import {
    NAMES, fakeSocket, fire, renderPage, resetGame, seat, settle, shellBottom, tribunalBox, tribunalEntry, tribunalResolved,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const chatSlot = () => document.querySelector('[data-talk-layout] [data-slot="chat"]')
const composerInput = () => shellBottom()?.querySelector("textarea, input") ?? null

// n명 판 dayIndex일 투표 중 모바일 화면
async function dayVotePage(n, dayIndex = 1) {
    const socket = fakeSocket()
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", dayIndex, deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    return socket
}

test("A04-M-009 재판 중 채팅방은 숨기기만 (8명 판): 재판 진입 → 채팅방 숨김(빠지지 않음)·바닥 입력칸 없음, 재판 끝 → 다시 보임", async () => {
    const socket = await dayVotePage(8)
    assert.ok(chatSlot(), "채팅방 자리가 없음")
    assert.ok(composerInput(), "재판 전 바닥 입력칸이 없음")
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 8, defendant: 3 }))
    assert.ok(tribunalBox(), "재판 창이 없음")
    const slot = chatSlot()
    assert.ok(slot, "재판 중 채팅방이 빠짐")
    assert.ok(slot.classList.contains("invisible"), "재판 중 채팅방이 안 숨겨짐")
    assert.ok(slot.querySelector("*"), "숨긴 채팅방 안이 빔(다시 그려짐)")
    assert.ok(composerInput() === null, "재판 중 바닥 입력칸이 남음")
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "NOT_GUILTY" }))
    assert.ok(tribunalBox() === null, "재판이 끝났는데 재판 창이 남음")
    assert.ok(!chatSlot().classList.contains("invisible"), "재판이 끝났는데 채팅방이 숨겨진 채")
})


test("A04-M-010 단계 줄 '5초 뒤 마감' (5명 판): 2일 재판 당김 → '제 2일 · 5초 뒤 마감' 꼴", async () => {
    const socket = await dayVotePage(5, 2)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 5, defendant: 2, dayIndex: 2 }))
    await fire(socket, "phase_settle_started", settle({ phase: "TRIBUNAL", dayIndex: 2, deadline: Date.now() + 5_000 }))
    const line = document.querySelector("[data-talk-phase-line]")
    assert.ok(line, "단계 줄이 없음")
    assert.match(textOf(line), /제 2일\s*·\s*5초 뒤 마감/)
})

test("A04-M-012 처형 직업·표 수 안 보임 (10명 판): 결과에 executedRole·counts → 추방 연출·채팅 알림 줄에 직업·수 없음", async () => {
    const socket = await dayVotePage(10)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 10, defendant: 3 }))
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "GUILTY", role: "JOKER", counts: { guilty: 7, notGuilty: 2 } }))
    // 추방 연출: 영상을 못 열면 바로 문구 단계
    const expel = document.querySelector("[data-ingame-tribunal-expulsion]")
    assert.ok(expel, "추방 연출이 없음")
    const video = expel.querySelector("video")
    if (video) act(() => { video.dispatchEvent(new window.Event("error")) })
    await waitUntil(() => document.querySelector('[data-ingame-tribunal-expulsion][data-expulsion-phase="message"]'), { label: "추방 문구 단계" })
    const message = textOf(document.querySelector("[data-ingame-tribunal-expulsion]"))
    assert.ok(message.includes(NAMES[3]), `추방 문구에 이름이 없음: ${message}`)
    for (const hidden of ["광대", "7", "2표", "유죄 7", "무죄 2"]) {
        assert.ok(!message.includes(hidden), `추방 문구에 "${hidden}"가 보임: ${message}`)
    }
    const talk = textOf(chatSlot())
    assert.ok(talk.includes(`${NAMES[3]}님이 죽었습니다`), `처형 알림 줄이 없음: ${talk}`)
    for (const hidden of ["광대", "7표", "2표"]) {
        assert.ok(!talk.includes(hidden), `채팅 알림 줄에 "${hidden}"가 보임`)
    }
})
