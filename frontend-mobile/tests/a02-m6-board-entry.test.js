// 모바일 판 시작 화면 시험: 넓은 배치 카드 판 칸(이름판·읽기 이름·상태·동료 배지·이모티콘 단계 차단), 역할 확인 덮개·시간 줄
// 목록 A02 모바일 A02-M-601~606 (돌리기: frontend-mobile 폴더에서 node --test tests/a02-m6-board-entry.test.js)
// 카드 판은 넓은 배치(폰 가로·태블릿)에만 있음, 시간 줄 = 명패+타이머 한 줄(PhaseTimerStrip)
import "./helpers/mobileLoader.mjs"
import { act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { flush, textOf } from "./a00-kit.mjs"
import { NAMES, boardSlot, confirmEntrances, dayResolved, fakeSocket, fire, renderPage, resetGame, seat, wideLayout } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 넓은 배치로 판 화면 그리기
async function boardPage(options) {
    wideLayout(true)
    seat(options)
    view = await renderPage(fakeSocket())
}
// 칸 안 카드 이름판 글 (카드 아래 p 안 span)
const plateText = (slot) => textOf(slot.querySelector("[data-ingame-player-nickname] p span"))
const timebar = () => document.querySelector("[data-ingame-phase-timer-mobile]")
const entryCover = () => document.querySelector("[data-ingame-entry-preparing]")

test("A02-M-601 10명 판 넓은 배치 카드 판 → 칸 10개, 칸마다 이름판 글 = 닉네임, 읽기 이름은 내 칸만 '가람, 나'", async () => {
    await boardPage({ n: 10, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    assert.equal(document.querySelectorAll("[data-board-slot]").length, 10)
    for (let i = 0; i < 10; i += 1) {
        const slot = boardSlot(i)
        assert.ok(slot, `${NAMES[i]} 카드 칸이 없음`)
        assert.equal(plateText(slot), NAMES[i])
        assert.equal(slot.getAttribute("aria-label"), i === 0 ? `${NAMES[0]}, 나` : NAMES[i])
    }
    // 내 카드만 "나" 표시 (읽기 이름 "본인")
    assert.equal(document.querySelectorAll('[data-board-slot] [aria-label="본인"]').length, 1)
    assert.ok(boardSlot(0).querySelector('[aria-label="본인"]'), "내 칸에 '나' 표시가 없음")
})

test("A02-M-602 죽은 사람·끊긴 사람 카드 (6명 판) → 이름판 글 그대로, 읽기 이름 '다솜, 사망'·'마루, 연결 끊김', 상태 값 dead·disconnected", async () => {
    await boardPage({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: [2], disconnected: [4] })
    const status = (i) => boardSlot(i).querySelector("[data-ingame-player-status]")?.getAttribute("data-ingame-player-status")
    assert.deepEqual(
        { deadName: plateText(boardSlot(2)), deadLabel: boardSlot(2).getAttribute("aria-label"), deadStatus: status(2) },
        { deadName: NAMES[2], deadLabel: `${NAMES[2]}, 사망`, deadStatus: "dead" },
    )
    assert.deepEqual(
        { offName: plateText(boardSlot(4)), offLabel: boardSlot(4).getAttribute("aria-label"), offStatus: status(4) },
        { offName: NAMES[4], offLabel: `${NAMES[4]}, 연결 끊김`, offStatus: "disconnected" },
    )
    assert.equal(status(1), "alive")
})

test("A02-M-603 역할 확인 단계 (6명 판) → 입장 준비 덮개 '가면무도회에 입장하는 중입니다.'(role=status), 시간 줄은 빈 명패·'00:00'", async () => {
    seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
    view = await renderPage(fakeSocket())
    assert.ok(entryCover(), "입장 준비 덮개가 없음")
    assert.equal(entryCover().getAttribute("role"), "status")
    assert.equal(textOf(entryCover()), "가면무도회에 입장하는 중입니다.")
    const strip = timebar()?.querySelector("[data-ingame-chat-phase-timer-strip]")
    assert.ok(strip, "역할 확인 중 시간 줄 명패가 없음")
    assert.equal(textOf(strip.querySelector("p")), "", "역할 확인 중 명패에 글이 있음")
    assert.equal(textOf(strip.querySelector("[role=timer]")), "00:00")
})

test("A02-M-604 역할 확인이 끝나 낮이 되면 (6명 판) → 입장 준비 덮개 없음, 명패에 단계 글", async () => {
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(fakeSocket())
    assert.equal(entryCover(), null, "낮인데 입장 준비 덮개가 남음")
    const label = textOf(timebar()?.querySelector("[data-ingame-chat-phase-timer-strip] p"))
    assert.ok(label.length > 0, "낮 명패에 글이 없음")
})

test("A02-M-605 넓은 배치 카드 판 동료 배지 (7명 판 광대 2명): 동료 칸에만 '동료' 배지·읽기 이름 '라온 · 동료 광대', 시민은 없음", async () => {
    await boardPage({ n: 7, role: "JOKER", allies: [3], phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    const badge = boardSlot(3).querySelector("[data-ingame-ally-badge]")
    assert.ok(badge, "동료 카드에 동료 배지가 없음")
    assert.equal(badge.getAttribute("data-ingame-ally-badge"), "동료 광대")
    assert.equal(textOf(badge), "동료")
    assert.equal(boardSlot(3).getAttribute("aria-label"), `${NAMES[3]} · 동료 광대`)
    assert.equal(boardSlot(0).querySelector("[data-ingame-ally-badge]"), null, "내 카드에 동료 배지가 있음")
    assert.equal(boardSlot(1).querySelector("[data-ingame-ally-badge]"), null, "동료 아닌 카드에 동료 배지가 있음")
    resetGame(view)
    view = null
    await boardPage({ n: 6, role: "CITIZEN", phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    assert.equal(document.querySelectorAll("[data-ingame-ally-badge]").length, 0, "시민인데 동료 배지가 보임")
})

test("A02-M-606 역할 확인·밤에는 이모티콘 팔레트 차단, 낮에 연 팔레트는 밤 전환 시 닫힘", async () => {
    const emojiDialog = () => document.querySelector("[data-ingame-emoji-palette]")
    const rightClickSelf = async () => {
        await act(async () => {
            boardSlot(0).dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
        })
        await flush()
    }
    wideLayout(true)
    seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
    view = await renderPage(fakeSocket())
    await rightClickSelf()
    assert.equal(emojiDialog(), null, "역할 확인 단계인데 이모티콘 팔레트가 열림")
    resetGame(view)
    view = null
    wideLayout(true)
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await confirmEntrances()
    await rightClickSelf()
    assert.ok(emojiDialog(), "낮인데 이모티콘 팔레트가 안 열림")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
    assert.equal(emojiDialog(), null, "밤으로 넘어갔는데 열린 이모티콘 팔레트가 남음")
})
