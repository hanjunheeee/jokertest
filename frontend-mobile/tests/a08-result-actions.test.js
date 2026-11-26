// 모바일 결과 화면 바닥 단추 시험: 대기방으로 가는 중 표시(aria-busy), 결과 없으면 단추 하나, 뒤로 가기 확인 글, 다시 이어져도 결과 그대로
// 목록 A08 모바일 A08-M-001·004·008·009 (돌리기: frontend-mobile 폴더에서 node --test tests/a08-result-actions.test.js)
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

test("A08-M-001 대기방으로 누르는 중·실패 안내: isReturning → '이동 중..'·aria-busy·두 단추 잠금, leaveNotice → 인라인 배너 표시", () => {
    const bottom = drawActions({ isReturning: true })
    const toRoom = buttonNamed("이동 중..", bottom)
    const toLobby = buttonNamed("로비로", bottom)
    assert.ok(toRoom && toLobby, `단추: ${buttonNames(bottom).join(" | ")}`)
    assert.equal(toRoom.getAttribute("aria-busy"), "true")
    assert.equal(toLobby.getAttribute("aria-busy"), null)
    assert.equal(toRoom.disabled, true)
    assert.equal(toLobby.disabled, true)
    assert.ok(bottom.querySelector('[data-testid="result-leave-notice"]') === null, "실패 안내 칸이 있음")

    view.rerender(React.createElement(ShellBottomSlotContext.Provider, { value: bottom },
        React.createElement(ResultActions, {
            hasResult: true, isReturning: false, isExitPending: false,
            leaveNotice: "대기방 정원이 가득 차 들어갈 수 없습니다.", noticeSource: "return",
            onReturnToMatching: () => {}, onExitToLobby: () => {}, onLeaveUnavailable: () => {},
        })))
    const notice = bottom.querySelector('[data-testid="result-leave-notice"]')
    assert.ok(notice, "실패 안내 배너가 없음")
    assert.equal(notice.getAttribute("data-notice-source"), "return")
    assert.equal(textOf(notice), "대기방 정원이 가득 차 들어갈 수 없습니다.")
    const [againRoom, againLobby] = both(bottom)
    assert.equal(againRoom.disabled, false)
    assert.equal(againLobby.disabled, false)
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
// 모바일 반응형 합침 뒤: 판이 끝나 승패 값이 있으면 결과 화면이 판 상태를 다시 안 물음(useResultPage freezeSnapshotSync)
// → 물었는지는 안 따지고, 물었으면 NOT_A_PARTICIPANT로 답해도 결과·단추가 남는지만 봄 (판 채널 다시 붙기는 서버가 접속 때 함)
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
    assert.ok(buttonNamed("대기방으로"), `결과 화면이 사라짐: ${buttonNames().join(" | ")}`)
})
