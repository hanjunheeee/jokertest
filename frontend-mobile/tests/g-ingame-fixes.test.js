// 모바일 판 화면 고친 것 시험: 죽은 의사 건너뛰기 꺼짐, 낮 내 카드 길게 누르면 이모티콘 팔레트, 재판 도중 피고 탈락은 사망 줄
// 모음 글 C-026·C-036, 결정 2026-11-16 오전 둘째 11번(재판 도중 피고 탈락은 사망으로) (돌리기: frontend-mobile 폴더에서 node --test tests/g-ingame-fixes.test.js)
// 행동 줄 거절 까닭 글·동료 표시·역할 확인 동안 채팅 꺼짐·이모티콘 낮에만 규칙은 지금 화면에 없음 → 그 시험(G-M-001·002·004~006·008·009)은 뺌
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { flush } from "./a00-kit.mjs"
import {
    GAME, NAMES, boardSlot, fakeSocket, fire, renderPage, resetGame, rowButtons, seat, tribunalBox, tribunalEntry, tribunalResolved, turnStarted, uuidOf,
    wideLayout,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 지금 화면은 죽은 의사에게도 건너뛰기를 그리되 꺼 둠 (구석 패널 nightActionsLocked 조건) → 눌리는 건너뛰기가 없으면 됨
test("G-M-003 [C-026] 6명 죽은 의사 밤: 의사 차례가 와도 행동 줄에 눌리는 건너뛰기 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 6, role: "DOCTOR", phase: "NIGHT", dead: [0] })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    const skip = rowButtons().find((b) => b.name === "건너뛰기")
    assert.ok(!skip || skip.enabled === false, `죽은 사람 행동 줄: ${JSON.stringify(rowButtons())}`)
})

// 넓은 배치 내 카드 칸을 길게 누른 것(우클릭)으로 팔레트 열기 → 열렸는지 (폰 세로엔 카드 판이 없어 이모티콘 보내기도 없음, 사용자 결정 전)
async function paletteOpensOnMySlot() {
    act(() => { boardSlot(0).dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })) })
    await flush()
    return document.querySelector('[aria-label="이모티콘 팔레트"]') !== null
}
test("G-M-007 [C-036] 6명 낮: 넓은 배치 내 카드 칸 길게 누름 → 이모티콘 팔레트 열림", async () => {
    wideLayout(true)
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(fakeSocket())
    assert.ok(boardSlot(0), "내 카드 칸이 없음 (준비 잘못)")
    assert.equal(await paletteOpensOnMySlot(), true)
})

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
