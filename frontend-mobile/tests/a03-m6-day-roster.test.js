// 모바일 낮 화면 시험: 시간 줄 남은 초 mm:ss, 플레이어 목록 시트(제목·부제·줄·투표하기·투표취소·못 누르는 까닭 글), 넓은 배치 카드 시트(투표하기)
// 목록 A03 모바일 A03-M-603~608 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-m6-day-roster.test.js)
// 폰 세로 낮은 채팅방 "플레이어 목록" 단추로 여는 시트 줄에 카드 메뉴와 같은 항목, 넓은 배치는 카드 칸을 눌러 여는 카드 시트
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { click, flush, textOf } from "./a00-kit.mjs"
import {
    GAME, NAMES, boardSlot, fakeSocket, openRoster, renderPage, resetGame, rosterItem, rosterItems, rosterRow, rosterSheet, seat, sheetItems, uuidOf,
    wideLayout,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const timebar = () => document.querySelector("[data-ingame-phase-timer-mobile]")
const sheetTitle = () => textOf(rosterSheet()?.querySelector("h2"))
// 목록 줄 아래 까닭 글 (줄 안 마지막 p, 없으면 "")
const rowHint = (i) => {
    const row = rosterRow(i)
    const last = row ? [...row.querySelectorAll(":scope > p")].at(-1) : null
    return textOf(last)
}

// 6명 판 1일 낮 (나는 0번 자리), dayPhase·남은 시간·내 값
async function dayPage({ dayPhase = "DAY_VOTE", seconds = 60, self, acks } = {}) {
    const socket = fakeSocket({ acks })
    seat({ n: 6, phase: "DAY", dayPhase, deadline: Date.now() + seconds * 1000, self })
    view = await renderPage(socket)
    return socket
}

test("A03-M-603 시간 줄 남은 초 (6명 판): 낮 토론 마감 75초 뒤 → 타이머 '01:15'(또는 '01:14') mm:ss, 명패에 단계 글", async () => {
    await dayPage({ dayPhase: "DAY_DISCUSSION", seconds: 75 })
    const strip = timebar()?.querySelector("[data-ingame-chat-phase-timer-strip]")
    assert.ok(strip, "시간 줄 명패가 없음")
    assert.match(textOf(strip.querySelector("[role=timer]")), /^01:1[45]$/)
    assert.ok(textOf(strip.querySelector("p")).length > 0, "명패에 단계 글이 없음")
})

test("A03-M-604 낮 투표 플레이어 목록 (6명 판): '플레이어 목록' 단추 → 시트 제목 '플레이어 목록'·부제 '투표할 플레이어를 고르세요.', 줄 6개, 내 줄 '(나)'·항목 없음, 남의 줄 '투표하기' 켜짐", async () => {
    await dayPage()
    const opener = document.querySelector('[data-testid="player-roster-open"]')
    assert.equal(opener?.getAttribute("aria-label"), "플레이어 목록")
    assert.equal(opener.getAttribute("data-roster-mode"), "day")
    await openRoster()
    assert.equal(sheetTitle(), "플레이어 목록")
    assert.ok(textOf(rosterSheet()).includes("투표할 플레이어를 고르세요."), `시트 글: ${textOf(rosterSheet())}`)
    assert.equal(rosterSheet().querySelectorAll("[data-roster-player]").length, 6)
    assert.ok(textOf(rosterRow(0)).includes(`${NAMES[0]} (나)`), `내 줄 글: ${textOf(rosterRow(0))}`)
    assert.deepEqual(rosterItems(0), [])
    assert.deepEqual(rosterItems(3), [{ name: "투표하기", enabled: true, kind: "DAY_VOTE" }])
})

test("A03-M-605 목록 줄 '투표하기' 누름 (6명 판) → cast_day_vote 1번(대상 3번 자리), 그 줄 강조", async () => {
    const socket = await dayPage({ acks: { cast_day_vote: { ok: true, gameId: GAME, dayIndex: 1, targetUuid: uuidOf(3) } } })
    await openRoster()
    act(() => { rosterItem(3, "투표하기").click() })
    await flush(6)
    const sent = socket.sentOf("cast_day_vote")
    assert.equal(sent.length, 1, "표가 안 나감")
    assert.ok(JSON.stringify(sent[0]).includes(uuidOf(3)), `표 대상: ${JSON.stringify(sent[0])}`)
    // 고른 줄만 밝은 테두리 (RosterRow HIGHLIGHT_CLASS)
    assert.match(rosterRow(3).className, /\bring-1\b/, "고른 줄 강조가 없음")
    assert.doesNotMatch(rosterRow(2).className, /\bring-1\b/, "안 고른 줄이 강조됨")
})

test("A03-M-606 표를 낸 대상 줄 (6명 판, 3번에 냄) → 그 줄만 '투표취소'(켜짐), 다른 줄은 '투표하기'", async () => {
    await dayPage({ self: { hasSubmittedDayVote: true, dayVoteTargetUuid: uuidOf(3) } })
    await openRoster()
    assert.deepEqual(rosterItems(3), [{ name: "투표취소", enabled: true, kind: "DAY_VOTE_CANCEL" }])
    assert.deepEqual(rosterItems(2).map((item) => item.name), ["투표하기"])
})

test("A03-M-607 못 누르는 까닭 글 (6명 판 토론 중): 목록 부제 '현재 참가자 목록입니다.', 남의 줄 '투표하기' 꺼짐 + 줄 아래 '토론 중입니다. 투표는 아직 열리지 않았습니다.'", async () => {
    await dayPage({ dayPhase: "DAY_DISCUSSION" })
    await openRoster()
    assert.ok(textOf(rosterSheet()).includes("현재 참가자 목록입니다."), `시트 글: ${textOf(rosterSheet())}`)
    assert.deepEqual(rosterItems(2), [{ name: "투표하기", enabled: false, kind: "DAY_VOTE" }])
    assert.equal(rowHint(2), "토론 중입니다. 투표는 아직 열리지 않았습니다.")
    assert.equal(rowHint(0), "", "항목 없는 내 줄에 까닭 글")
})

test("A03-M-608 넓은 배치 카드 시트 (6명 판 낮 투표): 남의 칸 누름 → 제목 그 이름·'투표하기' 하나(따로 '취소' 없음), 누르면 cast_day_vote 1번", async () => {
    wideLayout(true)
    const socket = fakeSocket({ acks: { cast_day_vote: { ok: true, gameId: GAME, dayIndex: 1, targetUuid: uuidOf(2) } } })
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    click(boardSlot(2))
    await flush()
    const menu = document.querySelector("[data-ingame-player-card-menu]")
    assert.ok(menu, "카드 시트가 안 뜸")
    assert.ok(textOf(menu).includes(NAMES[2]), `시트 글: ${textOf(menu)}`)
    assert.deepEqual(sheetItems(), [{ name: "투표하기", enabled: true, kind: "DAY_VOTE" }])
    act(() => { menu.querySelector('[role="menuitem"][aria-label="투표하기"]').click() })
    await flush(6)
    assert.equal(socket.sentOf("cast_day_vote").length, 1, "표가 안 나감")
    assert.ok(JSON.stringify(socket.sentOf("cast_day_vote")[0]).includes(uuidOf(2)), "표 대상이 2번 자리가 아님")
})
