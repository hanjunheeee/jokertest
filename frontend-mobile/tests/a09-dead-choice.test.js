// 모바일 사망 후 선택 창·나가기 안내 시험: 죽은 사람에게 벌 없음 글, 산 사람 나가기 실패엔 사망 글 없이 다시 시도, 나가는 중 글·단추 잠김
// 목록 A09 모바일 A09-M-001~004 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-dead-choice.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { answerConfirm, fakeSocket, renderPage, resetGame, seat } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const DEAD_TEXT = "사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다."
const deadPanel = () => document.querySelector('[role="dialog"][aria-label="사망 후 선택"]')
const leavePanel = () => document.querySelector('[role="dialog"][aria-label="게임 나가기 안내"]')

// 6명 판 1일 낮 (나는 0번), leaveAck = 나가기 요청 답
async function dayPage({ dead = false, leaveAck = { ok: false, code: "INTERNAL_ERROR" } } = {}) {
    const socket = fakeSocket({ acks: { leave_game_session: leaveAck } })
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: dead ? [0] : [], deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    return socket
}
// 산 사람이 위 줄 "게임 나가기" → 확인 창에서 "확인"
async function pressLeave() {
    answerConfirm(true)
    click(buttonNamed("게임 나가기"))
    await flush()
}

test("A09-M-001 모바일 사망 창 글: 죽은 사람 → '사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다.'", async () => {
    await dayPage({ dead: true })
    assert.ok(deadPanel(), "사망 후 선택 창이 없음")
    assert.ok(textOf(deadPanel()).includes(DEAD_TEXT), `창 글: ${textOf(deadPanel())}`)
})

test("A09-M-002 산 사람 나가기 실패 → '게임에서 나가지 못했습니다.' + 다시 시도, 사망 글 없음", async () => {
    const socket = await dayPage({ leaveAck: { ok: false, code: "INTERNAL_ERROR" } })
    await pressLeave()
    assert.equal(socket.sentOf("leave_game_session").length, 1, "나가기를 안 보냄")
    await waitUntil(() => leavePanel(), { label: "나가기 실패 안내" })
    const text = textOf(leavePanel())
    assert.ok(text.includes("게임에서 나가지 못했습니다."), `글: ${text}`)
    assert.ok(buttonNamed("다시 시도", leavePanel()), "다시 시도 단추가 없음")
    assert.ok(!text.includes("사망"), "산 사람에게 사망 글이 보임")
    assert.ok(deadPanel() === null)
})

test("A09-M-003 나가는 중 글: pending → '게임에서 나가는 중입니다.', 단추 꺼짐", async () => {
    await dayPage({ leaveAck: "never" })
    await pressLeave()
    await waitUntil(() => leavePanel(), { label: "나가는 중 안내" })
    assert.ok(textOf(leavePanel()).includes("게임에서 나가는 중입니다."), `글: ${textOf(leavePanel())}`)
    const back = buttonNamed("게임으로 돌아가기", leavePanel())
    assert.ok(back, "게임으로 돌아가기 단추가 없음")
    assert.equal(back.disabled, true, "나가는 중인데 단추가 켜짐")
})

test("A09-M-004 사망 창 열림 판단: 산 사람 실패 → 사망 글 없는 나가기 안내(selfDead 거짓), 죽은 사람 → 사망 후 선택(selfDead 참)", async () => {
    await dayPage({ leaveAck: { ok: false, code: "INTERNAL_ERROR" } })
    await pressLeave()
    await waitUntil(() => leavePanel(), { label: "나가기 실패 안내" })
    assert.ok(deadPanel() === null, "산 사람인데 사망 후 선택 창")
    resetGame(view)
    view = null
    await dayPage({ dead: true })
    assert.ok(deadPanel(), "죽은 사람인데 사망 후 선택 창이 없음")
    assert.ok(leavePanel() === null)
})
