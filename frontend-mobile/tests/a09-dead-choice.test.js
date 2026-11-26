// 모바일 사망 후 선택 창·산 사람 나가기 안내·판 중 초대 안내 시험
// 목록 A09 모바일 A09-M-001~005 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-dead-choice.test.js)
// 판 중 위 줄 "게임 나가기" 단추는 모바일에 없음 → 산 사람은 뒤로 가기로 나가기 확인을 띄움 (useInGameExit)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { answerConfirm, confirms, fakeSocket, renderPage, resetGame, router, seat, uuidOf } from "./a00-game.mjs"

const { useGameInviteStore } = await import("@/domains/lobby/store/gameInvite.store.js")

let view = null
afterEach(() => {
    useGameInviteStore.setState({ invites: [] })
    resetGame(view)
    view = null
})

const deadPanel = () => document.querySelector('[role="dialog"][aria-label="사망 후 선택"]')
const leavePanel = () => document.querySelector('[role="dialog"][aria-label="게임 나가기 안내"]')

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

test("A09-M-001 모바일 사망 창 글: 죽은 사람 → '당신은 사망했습니다.' + 탈주 아님·골드 지급 안내 + '관전 계속하기'·'게임 나가기'", async () => {
    await dayPage({ dead: true })
    const panel = deadPanel()
    assert.ok(panel, "사망 후 선택 창이 없음")
    const text = textOf(panel)
    assert.ok(text.includes("당신은 사망했습니다."), `창 글: ${text}`)
    assert.ok(text.includes("남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다."), `창 글: ${text}`)
    assert.ok(text.includes("사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다."), `벌 없음 안내 글이 없음: ${text}`)
    assert.equal(buttonNamed("관전 계속하기", panel)?.disabled, false)
    assert.equal(buttonNamed("게임 나가기", panel)?.disabled, false)
})

test("A09-M-002 산 사람 나가기 실패 → 사망 창 대신 '게임 나가기 안내' 창에 '게임에서 나가지 못했습니다.' + '게임으로 돌아가기'·'다시 시도'", async () => {
    const socket = await dayPage({ leaveAck: { ok: false, code: "INTERNAL_ERROR" } })
    await pressLeave()
    assert.equal(socket.sentOf("leave_game_session").length, 1, "나가기를 안 보냄")
    await waitUntil(() => leavePanel(), { label: "산 사람 나가기 실패 안내" })
    assert.equal(deadPanel(), null, "산 사람 나가기 실패인데 사망 후 선택 창이 뜸")
    const text = textOf(leavePanel())
    assert.ok(text.includes("게임에서 나가지 못했습니다."), `창 글: ${text}`)
    assert.ok(!text.includes("당신은 사망했습니다."), `사망 문구가 잘못 보임: ${text}`)
    const status = leavePanel().querySelector('[role="status"]')
    assert.equal(textOf(status), "나가기에 실패했습니다. 다시 시도해 주세요.")
    assert.ok(buttonNamed("게임으로 돌아가기", leavePanel()), "게임으로 돌아가기 단추가 없음")
    const retry = buttonNamed("다시 시도", leavePanel())
    assert.ok(retry, "다시 시도 단추가 없음")
    const asked = confirms.length
    await act(async () => { retry.click() })
    await flush()
    assert.equal(socket.sentOf("leave_game_session").length, 2, "다시 시도가 안 보냄")
    assert.equal(confirms.length, asked, "다시 시도에 확인 창이 또 뜸")
})

test("A09-M-003 산 사람 나가는 중 글: pending → '게임 나가기 안내' 창에 '게임에서 나가는 중입니다.', 돌아가기 단추 꺼짐", async () => {
    await dayPage({ leaveAck: "never" })
    await pressLeave()
    await waitUntil(() => leavePanel(), { label: "나가는 중 안내" })
    assert.equal(deadPanel(), null, "산 사람 나가는 중인데 사망 창이 뜸")
    assert.ok(textOf(leavePanel()).includes("게임에서 나가는 중입니다."))
    assert.equal(buttonNamed("게임으로 돌아가기", leavePanel()).disabled, true, "나가는 중인데 돌아가기가 켜짐")
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

test("A09-M-005 판 화면 새 대기방 초대 안내: 죽은 사람이 관전 중 새 초대를 받으면 '로비로 가면 수락' 안내가 뜨고 닫기로 닫힘", async () => {
    await dayPage({ dead: true })
    await act(async () => { buttonNamed("관전 계속하기", deadPanel()).click() })
    await flush()
    assert.equal(document.querySelector("[data-ingame-invite-notice]"), null)
    await act(async () => {
        useGameInviteStore.setState({
            invites: [{
                inviteId: "inv-1",
                receiverId: uuidOf(0),
                senderName: "민수",
                status: "PENDING",
                revision: 1,
                creationSeq: "10",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            }],
        })
    })
    await flush()
    const notice = document.querySelector("[data-ingame-invite-notice]")
    assert.ok(notice, "초대 안내 줄이 뜨지 않음")
    assert.ok(textOf(notice).includes("민수 님이 대기방으로 초대했습니다. 게임에서 나가 로비로 가면 수락할 수 있습니다."))
    await act(async () => { buttonNamed("초대 안내 닫기", notice).click() })
    await flush()
    assert.equal(document.querySelector("[data-ingame-invite-notice]"), null, "닫기 뒤에도 초대 안내가 남음")
})
