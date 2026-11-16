// 모바일 판에 돌아왔을 때 역할 창 시험: 새 탭·새 기기로 재판·밤·낮 투표 중 돌아오면 역할 창 안 뜸, 낮 토론 중엔 뜸, "내 역할 보기"로는 열림
// 목록 A02 모바일 A02-M-012~015 (돌리기: frontend-mobile 폴더에서 node --test tests/a02-role-reveal-return.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import { fakeSocket, renderPage, resetGame, seat } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 역할 창이 떠 있는지 (body로 띄운 것까지 찾음)
const revealShown = () => document.querySelector("[data-ingame-role-reveal]") !== null

// 7명 판 의사로, 탭 기억 없이(새 탭·새 기기) 그 단계 판 화면을 그림
async function returnInPhase({ phase, dayPhase = "DAY_VOTE" }) {
    const socket = fakeSocket()
    seat({ n: 7, me: 2, role: "DOCTOR", phase, dayPhase, seenRoleReveal: false })
    view = await renderPage(socket)
    await flush()
}

test("A02-M-012 모바일 7명 판 재판 중 새 기기로 돌아옴 → 역할 창 없음", async () => {
    await returnInPhase({ phase: "TRIBUNAL" })
    assert.equal(revealShown(), false)
})

test("A02-M-013 모바일 7명 판 밤 중 새 기기로 돌아옴 → 역할 창 없음", async () => {
    await returnInPhase({ phase: "NIGHT" })
    assert.equal(revealShown(), false)
})

test("A02-M-014 모바일 7명 판 낮 토론 중 새 기기로 돌아옴 → 역할 창 뜸 (지금대로), 낮 투표 중이면 안 뜸", async () => {
    await returnInPhase({ phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    assert.equal(revealShown(), true)
    resetGame(view)
    view = null
    await returnInPhase({ phase: "DAY", dayPhase: "DAY_VOTE" })
    assert.equal(revealShown(), false)
})

test("A02-M-015 모바일 7명 판 재판 중 돌아와 창이 안 뜸 → 위 줄 \"내 역할 보기\" 누르면 역할 창, 직업 \"의사\"", async () => {
    await returnInPhase({ phase: "TRIBUNAL" })
    assert.equal(revealShown(), false)
    const button = buttonNamed("내 역할 보기")
    assert.ok(button, "\"내 역할 보기\" 단추가 없음")
    click(button)
    await flush()
    const box = document.querySelector("[data-ingame-role-reveal]")
    assert.ok(box, "역할 창이 안 열림")
    assert.equal(box.getAttribute("data-ingame-role-reveal"), "DOCTOR")
    assert.ok(box.textContent.includes("의사"), box.textContent)
})
