// 모바일 판 화면 고친 것 시험: 거절 까닭 글(행동 줄)·죽은 사람 건너뛰기 없음·동료 표시·역할 확인 동안 채팅 꺼짐·이모티콘 낮에만
// 모음 글 C-021·C-026·C-027·C-036, 결정 2026-11-16 아침 7번·오전 둘째 11번(재판 도중 피고 탈락은 사망으로) (돌리기: frontend-mobile 폴더에서 node --test tests/g-ingame-fixes.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { flush } from "./a00-kit.mjs"
import {
    GAME, NAMES, fakeSocket, fire, renderPage, resetGame, rowButtons, seat, sheetItems, stripSlot, tribunalBox, tribunalEntry,
    tribunalResolved, turnStarted, uuidOf,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 행동 줄의 거절 까닭 글 (없으면 null)
const noticeText = () => document.querySelector("[data-ingame-action-row] [data-ingame-action-notice]")?.textContent ?? null
// 띠 칸을 눌러 연 시트에서 그 이름 항목을 누름
async function pickFromSheet(i, name) {
    act(() => { stripSlot(i).click() })
    await flush()
    const item = [...document.querySelectorAll('[data-ingame-player-card-menu] [role="menuitem"]')]
        .find((b) => b.getAttribute("aria-label") === name)
    assert.ok(item, `시트에 ${name} 항목 없음: ${JSON.stringify(sheetItems())}`)
    act(() => { item.click() })
    await flush(6)
}

test("G-M-001 [C-021] 7명 광대 밤: 암살이 TARGET_IS_ALLY로 거절 → 행동 줄에 \"동료 광대는 고를 수 없습니다.\" 글(role=alert)", async () => {
    const socket = fakeSocket({ acks: { submit_night_action: { ok: false, code: "TARGET_IS_ALLY" } } })
    seat({ n: 7, role: "JOKER", allies: [1], phase: "NIGHT" })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "JOKER" }))
    assert.equal(noticeText(), null)
    await pickFromSheet(4, "암살")
    assert.equal(socket.sentOf("submit_night_action").length, 1, "밤 행동이 안 나감 (준비 잘못)")
    assert.equal(noticeText(), "동료 광대는 고를 수 없습니다.")
    assert.equal(document.querySelector("[data-ingame-action-notice]").getAttribute("role"), "alert")
})

test("G-M-002 [C-021] 6명 낮 투표: 표가 거절(글 \"대상이 살아 있지 않습니다.\") → 행동 줄에 그 글", async () => {
    const message = "대상이 살아 있지 않습니다."
    const socket = fakeSocket({ acks: { cast_day_vote: { ok: false, code: "TARGET_NOT_ALIVE", message } } })
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await pickFromSheet(3, "투표하기")
    assert.equal(socket.sentOf("cast_day_vote").length, 1, "표가 안 나감 (준비 잘못)")
    assert.equal(noticeText(), message)
})

test("G-M-003 [C-026] 6명 죽은 의사 밤: 의사 차례가 와도 행동 줄에 건너뛰기 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 6, role: "DOCTOR", phase: "NIGHT", dead: [0] })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    assert.ok(!rowButtons().some((b) => b.name === "건너뛰기"), `죽은 사람 행동 줄: ${JSON.stringify(rowButtons())}`)
})

test("G-M-004 [결정 아침 7번] 7명 의사(동료 = 1번 자리): 1번 띠 칸에만 \"동료 의사\" 표시, 칸 읽기 이름 \"나래 · 동료 의사\"", async () => {
    const socket = fakeSocket()
    seat({ n: 7, role: "DOCTOR", allies: [1], phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(socket)
    const badges = Array.from({ length: 7 }, (_, i) => stripSlot(i).querySelector("[data-ingame-ally-badge]")?.getAttribute("data-ingame-ally-badge") ?? null)
    assert.deepEqual(badges, [null, "동료 의사", null, null, null, null, null])
    assert.equal(stripSlot(1).getAttribute("aria-label"), `${NAMES[1]} · 동료 의사`)
    assert.equal(stripSlot(2).getAttribute("aria-label"), NAMES[2])
})

test("G-M-005 [결정 아침 7번] 8명 시민: 어느 띠 칸에도 동료 표시 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 8, role: "CITIZEN", phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(socket)
    assert.equal(document.querySelectorAll("[data-ingame-ally-badge]").length, 0)
})

test("G-M-006 [C-027] 6명 역할 확인 단계: 채팅 입력칸·보내기 꺼짐, 낮이면 켜짐", async () => {
    const socket = fakeSocket()
    seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
    view = await renderPage(socket)
    const input = document.querySelector('textarea[aria-label="채팅 입력"]')
    const send = document.querySelector('button[aria-label="채팅 보내기"]')
    assert.ok(input && send, "채팅 입력칸·보내기가 화면에 없음")
    assert.deepEqual({ input: input.disabled, send: send.disabled }, { input: true, send: true })
    resetGame(view)
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(fakeSocket())
    assert.equal(document.querySelector('textarea[aria-label="채팅 입력"]').disabled, false)
    assert.equal(document.querySelector('button[aria-label="채팅 보내기"]').disabled, false)
})

// 내 띠 칸을 길게 누른 것(우클릭)으로 팔레트 열기 → 열렸는지
async function paletteOpensOnMySlot() {
    act(() => { stripSlot(0).dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })) })
    await flush()
    return document.querySelector('[aria-label="이모티콘 팔레트"]') !== null
}
for (const [id, label, options, expected] of [
    ["G-M-007", "낮", { phase: "DAY", dayPhase: "DAY_DISCUSSION" }, true],
    ["G-M-008", "밤", { phase: "NIGHT" }, false],
    ["G-M-009", "역할 확인", { phase: "ROLE_REVEAL", dayIndex: 0 }, false],
]) {
    test(`${id} [C-036] 6명 ${label}: 내 띠 칸 길게 누름 → 이모티콘 팔레트 ${expected ? "열림" : "안 열림"}`, async () => {
        seat({ n: 6, ...options })
        view = await renderPage(fakeSocket())
        assert.equal(await paletteOpensOnMySlot(), expected)
    })
}

// 채팅방의 알림 줄 글
const noticeLines = () => [...document.querySelectorAll('[role="log"] li')]
    .filter((li) => li.getAttribute("data-talk-line") === "system").map((li) => li.textContent.trim())

test("G-M-010 [결정 둘째 11번] 7명 재판 도중 피고 탈락(player_eliminated + DEFENDANT_DIED) → 재판 창 닫힘, 채팅방에 \"○○님이 죽었습니다\" 줄, \"취소\" 글 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 7, defendant: 3 }))
    assert.ok(tribunalBox(), "재판 창이 안 뜸 (준비 잘못)")
    await fire(socket, "player_eliminated", {
        gameId: GAME, phase: "NIGHT", dayIndex: 1,
        players: Array.from({ length: 7 }, (_, i) => ({ uuid: uuidOf(i), alive: i !== 3 })),
        victimUuid: uuidOf(3),
    })
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "DEFENDANT_DIED" }))
    assert.equal(tribunalBox(), null, "재판 창이 남음")
    assert.deepEqual(noticeLines(), [`${NAMES[3]}님이 죽었습니다`])
    assert.equal(/재판.{0,6}취소|취소.{0,6}재판/.test(document.body.textContent), false, "재판 취소 글이 보임")
})
