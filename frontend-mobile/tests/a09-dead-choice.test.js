// 모바일 사망 후 선택 창 시험: 죽은 사람 창 글·단추, 산 사람 나가기 실패·나가는 중에도 같은 "사망 후 선택" 창에 나가기 안내 글·다시 시도
// 목록 A09 모바일 A09-M-001~004, 합친 화면(2026-11-24 되돌림)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-dead-choice.test.js)
// 판 중 위 줄 "게임 나가기" 단추는 2026-11-24 새 배치에서 없어짐 (사용자 결정 전) → 산 사람은 뒤로 가기로 나가기 확인을 띄움 (useInGameExit가 뒤로 가기를 막고 확인)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { answerConfirm, confirms, fakeSocket, renderPage, resetGame, router, seat } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const deadPanel = () => document.querySelector('[role="dialog"][aria-label="사망 후 선택"]')

// 6명 판 1일 낮 (나는 0번), leaveAck = 나가기 요청 답
async function dayPage({ dead = false, leaveAck = { ok: false, code: "INTERNAL_ERROR" } } = {}) {
    const socket = fakeSocket({ acks: { leave_game_session: leaveAck } })
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: dead ? [0] : [], deadline: Date.now() + 60_000 })
    view = await renderPage(socket, { before: ["/multiplay"] })
    return socket
}
// 산 사람이 뒤로 가기 → 나가기 확인 창에서 "확인"
async function pressLeave() {
    answerConfirm(true)
    await act(async () => { await router.navigate(-1) })
    await flush()
    assert.ok(confirms.length > 0, "뒤로 가기에 나가기 확인 창이 안 뜸 (준비 잘못)")
}

test("A09-M-001 모바일 사망 창 글: 죽은 사람 → '당신은 사망했습니다.'·'남은 경기를 계속 지켜보거나…' + '관전 계속하기'·'게임 나가기' (벌 없음 글은 없음)", async () => {
    await dayPage({ dead: true })
    const panel = deadPanel()
    assert.ok(panel, "사망 후 선택 창이 없음")
    const text = textOf(panel)
    assert.ok(text.includes("당신은 사망했습니다."), `창 글: ${text}`)
    assert.ok(text.includes("남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다."), `창 글: ${text}`)
    assert.ok(!text.includes("탈주가 아니며"), "벌 없음 글이 보임")
    assert.equal(buttonNamed("관전 계속하기", panel)?.disabled, false)
    assert.equal(buttonNamed("게임 나가기", panel)?.disabled, false)
})

test("A09-M-002 산 사람 나가기 실패 → '사망 후 선택' 창에 '나가기에 실패했습니다. 다시 시도해 주세요.' + '다시 시도'", async () => {
    const socket = await dayPage({ leaveAck: { ok: false, code: "INTERNAL_ERROR" } })
    await pressLeave()
    assert.equal(socket.sentOf("leave_game_session").length, 1, "나가기를 안 보냄")
    await waitUntil(() => deadPanel(), { label: "나가기 실패 안내" })
    const status = deadPanel().querySelector('[role="status"]')
    assert.equal(textOf(status), "나가기에 실패했습니다. 다시 시도해 주세요.")
    const retry = buttonNamed("다시 시도", deadPanel())
    assert.ok(retry, "다시 시도 단추가 없음")
    // 다시 시도 = 확인 창 없이 한 번 더 보냄
    const asked = confirms.length
    await act(async () => { retry.click() })
    await flush()
    assert.equal(socket.sentOf("leave_game_session").length, 2, "다시 시도가 안 보냄")
    assert.equal(confirms.length, asked, "다시 시도에 확인 창이 또 뜸")
})

test("A09-M-003 나가는 중 글: pending → '나가는 중입니다…', '관전 계속하기'·'게임 나가기' 꺼짐", async () => {
    await dayPage({ leaveAck: "never" })
    await pressLeave()
    await waitUntil(() => deadPanel(), { label: "나가는 중 안내" })
    assert.equal(textOf(deadPanel().querySelector('[role="status"]')), "나가는 중입니다…")
    assert.equal(buttonNamed("관전 계속하기", deadPanel()).disabled, true, "나가는 중인데 관전 계속하기가 켜짐")
    assert.equal(buttonNamed("게임 나가기", deadPanel()).disabled, true, "나가는 중인데 게임 나가기가 켜짐")
})

test("A09-M-004 사망 창 열림 판단: 산 사람은 나가기 전엔 창 없음, 죽은 사람은 바로 '사망 후 선택', '관전 계속하기' 누르면 닫힘", async () => {
    await dayPage({ leaveAck: { ok: false, code: "INTERNAL_ERROR" } })
    assert.equal(deadPanel(), null, "산 사람인데 사망 후 선택 창")
    resetGame(view)
    view = null
    await dayPage({ dead: true })
    assert.ok(deadPanel(), "죽은 사람인데 사망 후 선택 창이 없음")
    await act(async () => { buttonNamed("관전 계속하기", deadPanel()).click() })
    await flush()
    assert.equal(deadPanel(), null, "관전 계속하기를 눌러도 창이 남음")
})
