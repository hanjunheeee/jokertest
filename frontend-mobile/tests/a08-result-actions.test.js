// 모바일 결과 화면 바닥 단추 시험: 가는 중엔 두 단추 다 잠김, 떠나기 실패 안내 자리, 결과 없으면 단추 하나, 뒤로 가기 확인 글, 끊겨 빠진 뒤 대기방으로 글
// 목록 A08 모바일 A08-M-001~004·008~011 (돌리기: frontend-mobile 폴더에서 node --test tests/a08-result-actions.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, buttonNames, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { confirms, endGame, fakeSocket, renderRoute, resetGame, router, seat, skipIntro } from "./a00-game.mjs"

const { default: ResultActions } = await import("@m/domains/game/result/components/actions/ResultActions.jsx")
const { default: GameResultPage } = await import("@m/domains/game/result/pages/GameResultPage.jsx")
const { ShellBottomSlotContext } = await import("@m/shared/layouts/mobileShellSlots.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 바닥 단추 줄만 그리기 (화면 틀 바닥 자리 포함)
function drawActions(props) {
    const bottom = document.createElement("div")
    bottom.setAttribute("data-shell-bottom", "")
    document.body.appendChild(bottom)
    const drawn = render(React.createElement(ShellBottomSlotContext.Provider, { value: bottom },
        React.createElement(ResultActions, { hasResult: true, isReturning: false, isExitPending: false, onReturnToMatching: () => {}, onExitToLobby: () => {}, onLeaveUnavailable: () => {}, ...props })))
    view = drawn
    return bottom
}
const both = (root) => [buttonNamed("대기방으로", root), buttonNamed("로비로", root)]

test("A08-M-001 대기방으로 누르는 중 두 단추 잠김: isReturning → '이동 중..', 두 단추 꺼짐", () => {
    const bottom = drawActions({ isReturning: true })
    assert.ok(textOf(bottom).includes("이동 중.."), `글: ${textOf(bottom)}`)
    const [toRoom, toLobby] = both(bottom)
    assert.ok(toRoom && toLobby, `단추: ${buttonNames(bottom).join(" | ")}`)
    assert.equal(toRoom.disabled, true)
    assert.equal(toLobby.disabled, true)
})

test("A08-M-002 로비로 가는 중에도 두 단추 잠김: isExitPending → 두 단추 꺼짐", () => {
    const bottom = drawActions({ isExitPending: true })
    const [toRoom, toLobby] = both(bottom)
    assert.equal(toRoom.disabled, true, "로비로 가는 중인데 대기방으로가 켜짐")
    assert.equal(toLobby.disabled, true, "로비로 가는 중인데 로비로가 켜짐")
})

test("A08-M-003 실패 안내: 안내 글 있음 → 단추 줄 위 result-leave-notice, role=alert", () => {
    const bottom = drawActions({ leaveNotice: "대기방 정원이 가득 차 들어갈 수 없습니다.", noticeSource: "return" })
    const notice = bottom.querySelector('[data-testid="result-leave-notice"]')
    assert.ok(notice, "실패 안내가 없음")
    assert.equal(notice.getAttribute("role"), "alert")
    assert.equal(textOf(notice), "대기방 정원이 가득 차 들어갈 수 없습니다.")
    // 단추 줄보다 앞(위)에 있음
    const firstButton = bottom.querySelector("button")
    assert.ok(notice.compareDocumentPosition(firstButton) & window.Node.DOCUMENT_POSITION_FOLLOWING, "안내가 단추 줄 아래에 있음")
})

test("A08-M-004 결과 없음이면 단추 하나: '로비로 돌아가기' 하나, '대기방으로' 없음", () => {
    const bottom = drawActions({ hasResult: false })
    assert.deepEqual(buttonNames(bottom), ["로비로 돌아가기"])
})

test("A08-M-008 결과 화면 뒤로 가기 확인 글: 뒤로 가기 → '로비로 나가시겠습니까?'", async () => {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY" })
    endGame({ roles: ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN", "GUARD"], winner: "CITIZEN" })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult", before: ["/ingame"] })
    await skipIntro()
    await act(async () => { router.navigate(-1) })
    await flush()
    await waitUntil(() => confirms.length > 0, { label: "뒤로 가기 확인 창" })
    assert.equal(confirms.at(-1), "로비로 나가시겠습니까?")
    assert.equal(router.state.location.pathname, "/gameresult", "취소했는데 화면이 바뀜")
})

// 결과 화면에서 끊겼다 다시 이어져 스냅샷 답이 "그 판에 없음"이어도 받아 둔 결과·"대기방으로" 단추가 남음 (모바일도 같은 결과 값 훅)
test("A08-M-009 결과 화면 다시 이어짐: 스냅샷 답 NOT_A_PARTICIPANT → 결과 화면·'대기방으로' 단추 그대로", async () => {
    const socket = fakeSocket()
    seat({ n: 5, phase: "DAY" })
    endGame({ roles: ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"], winner: "CITIZEN" })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult" })
    await skipIntro()
    assert.ok(buttonNamed("대기방으로"), `단추: ${buttonNames().join(" | ")}`)
    socket.acks.get_session_snapshot = { ok: false, code: "NOT_A_PARTICIPANT", message: "요청이 거절되었습니다." }
    socket.id = "sock-m1-again"
    await act(async () => { socket.fire("connect") })
    await flush()
    await flush()
    assert.ok(socket.sentOf("get_session_snapshot").length >= 1, "다시 이어진 뒤 스냅샷을 안 물음")
    assert.ok(buttonNamed("대기방으로"), `결과 화면이 사라짐: ${buttonNames().join(" | ")}`)
})

// 결과 화면에서 끊겨 끝난 판에서 빠진 뒤 "대기방으로" → 서버 SESSION_ENDED: 시간이 남았으면 끊겨 빠졌다는 글, 다 지났으면 시간 지남 글 (사용자 결정 2026-11-16 일곱째)
async function pressReturnAfterDrop(closesAt) {
    const socket = fakeSocket({ acks: { return_to_room: { ok: false, code: "SESSION_ENDED" }, get_current_room: { ok: true, room: null } } })
    seat({ n: 6, phase: "DAY" })
    endGame({ roles: ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN", "GUARD"], winner: "CITIZEN", closesAt })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult" })
    await skipIntro()
    const button = buttonNamed("대기방으로")
    assert.ok(button, `단추: ${buttonNames().join(" | ")}`)
    await act(async () => { button.click() })
    await waitUntil(() => document.querySelector('[data-testid="result-leave-notice"]') !== null, { label: "대기방으로 실패 글" })
    return textOf(document.querySelector('[data-testid="result-leave-notice"]'))
}

test("A08-M-010 모바일 6명 판 결과 화면 120초 남음 + SESSION_ENDED → '연결이 끊겨 이 판에서 빠졌습니다. '로비로'를 눌러 주세요.'", async () => {
    const text = await pressReturnAfterDrop(Date.now() + 120_000)
    assert.equal(text, "연결이 끊겨 이 판에서 빠졌습니다. '로비로'를 눌러 주세요.")
})

test("A08-M-011 모바일 6명 판 결과 화면 시간 다 지남 + SESSION_ENDED → '결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.'", async () => {
    const text = await pressReturnAfterDrop(Date.now() - 1_000)
    assert.equal(text, "결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.")
})
