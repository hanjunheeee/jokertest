// 모바일 재판 중 채팅방·시간 줄·처형 알림 시험: 피고 등장 연출 동안 채팅방은 막기만(빠지지 않음), 시간 줄 "5초 뒤 마감", 처형 직업·표 수는 안 보임
// 목록 A04 모바일 A04-M-009·010·012 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-tribunal-talk.test.js)
// 폰 세로 재판: 피고 등장 연출이 잠시 덮고 저절로 닫힘, 그동안 채팅방·바닥 입력칸은 그대로 있고 눌리지만 않음(inert) (2026-11-24 새 배치)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { textOf, waitUntil } from "./a00-kit.mjs"
import {
    NAMES, fakeSocket, fire, openTribunalSheet, renderPage, resetGame, seat, settle, shellBottom, tribunalBox, tribunalEntry, tribunalResolved,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const chatSlot = () => document.querySelector('[data-talk-layout] [data-slot="chat"]')
const composerInput = () => shellBottom()?.querySelector("textarea, input") ?? null
const composerBar = () => shellBottom()?.querySelector("[data-chat-composer]") ?? null
const talkList = () => document.querySelector("[data-talk-list]")

// n명 판 dayIndex일 투표 중 모바일 화면
async function dayVotePage(n, dayIndex = 1) {
    const socket = fakeSocket()
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", dayIndex, deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    return socket
}

test("A04-M-009 재판 연출 중 채팅방은 막기만 (8명 판): 재판 진입 → 채팅방·입력칸 그대로(빠지지 않음)·눌리지 않음, 연출 끝 → 다시 눌림, 재판 끝 → 그대로", async () => {
    const socket = await dayVotePage(8)
    assert.ok(chatSlot(), "채팅방 자리가 없음")
    assert.ok(composerInput(), "재판 전 바닥 입력칸이 없음")
    const listBefore = talkList()
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 8, defendant: 3 }))
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    const slot = chatSlot()
    assert.ok(slot, "재판 중 채팅방이 빠짐")
    assert.ok(slot.hasAttribute("inert"), "연출 중 채팅방이 눌림(inert 아님)")
    assert.ok(talkList() === listBefore, "연출 중 채팅방이 빠졌다가 새로 그려짐")
    assert.ok(composerInput(), "연출 중 바닥 입력칸이 빠짐")
    assert.ok(composerBar().hasAttribute("inert"), "연출 중 바닥 입력칸이 눌림(inert 아님)")
    // 연출이 저절로 닫히면 재판 중에도 채팅방·입력칸이 다시 눌림 (시트는 열어 둠)
    await openTribunalSheet()
    assert.ok(!chatSlot().hasAttribute("inert"), "연출이 끝났는데 채팅방이 막힌 채")
    assert.ok(!composerBar().hasAttribute("inert"), "연출이 끝났는데 입력칸이 막힌 채")
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "NOT_GUILTY" }))
    assert.ok(tribunalBox() === null, "재판이 끝났는데 재판 연출이 남음")
    assert.ok(talkList() === listBefore, "재판 뒤 채팅방이 새로 그려짐")
})


// "제 2일" 날짜 글·당김 표시 칸 값(data-ingame-phase-settle)은 지금 폰 세로 화면에 없음 → 시간 줄 명패 글·남은 초만 봄
test("A04-M-010 시간 줄 '5초 뒤 마감' (5명 판): 2일 재판 당김 → 시간 줄 명패 '[5초 뒤 마감]'·남은 초 5 이하", async () => {
    const socket = await dayVotePage(5, 2)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 5, defendant: 2, dayIndex: 2 }))
    await fire(socket, "phase_settle_started", settle({ phase: "TRIBUNAL", dayIndex: 2, deadline: Date.now() + 5_000 }))
    const bar = document.querySelector("[data-ingame-phase-timer-mobile]")
    assert.ok(bar, "시간 줄이 없음")
    assert.ok(textOf(bar).includes("[5초 뒤 마감]"), `시간 줄 글: ${textOf(bar)}`)
    const clock = textOf(bar.querySelector("[role=timer]")).match(/(\d{2}):(\d{2})/)
    assert.ok(clock, `시간 줄의 남은 시간이 없음: ${textOf(bar)}`)
    assert.ok(Number(clock[1]) * 60 + Number(clock[2]) <= 5, `남은 초가 5보다 큼: ${clock[0]}`)
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
