// 모바일 신고 시트 시험: 사유 네 칸 글(PC와 같은 글), "기타" + 빈 메모 → 메모 안내, 중복 신고(409) → 안내 글 + 그 줄 "신고됨"
// 목록 A13 모바일 A13-M-002·003 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-report-sheet.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf } from "./a00-kit.mjs"
import { act } from "./helpers/dom.mjs"
import { NAMES, ROLE_TEAM, resetGame, serve, useAuthStore, useInGameStore } from "./a00-game.mjs"

const { default: ResultBoard } = await import("@m/domains/game/result/components/board/ResultBoard.jsx")
const { useGameResultData } = await import("@/domains/game/result/hooks/useGameResultData.js")
const { REPORT_REASONS } = await import("@/domains/report/constants/reportCopy.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 5명 판이 끝난 결과판 (나는 0번), 신고 답은 reportAnswer
// 신고는 판 id·사람 id가 uuid 모양일 때만 됨 → 서버처럼 uuid 모양으로 판을 차림
const GAME_ID = "8f0c2b1e-4a1d-4c3e-9b2a-000000000001"
const idOf = (i) => `8f0c2b1e-4a1d-4c3e-9b2a-1000000000${String(i).padStart(2, "0")}`
const ROLES = ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"]
async function resultBoard(reportAnswer) {
    if (reportAnswer) serve({ "POST /reports": reportAnswer })
    act(() => { useAuthStore.setState({ isLoggedIn: true, user: { uuid: idOf(0), nickname: NAMES[0] } }) })
    const players = ROLES.map((_, i) => ({ uuid: idOf(i), nickname: NAMES[i], isAlive: true, isConnected: true, isParticipating: true, themeIndex: i }))
    act(() => {
        useInGameStore.getState().setGamePayload({ gameId: GAME_ID, state: { id: GAME_ID, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION", players, self: { uuid: idOf(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN" } } })
        const state = useInGameStore.getState().state
        const reveals = ROLES.map((role, i) => ({ uuid: idOf(i), nickname: NAMES[i], role, team: ROLE_TEAM[role], alive: true, deathReason: null, goldReward: 0 }))
        useInGameStore.setState({ state: { ...state, phase: "ENDED", winResult: { winner: "CITIZEN", reveals } } })
    })
    function Board() {
        const data = useGameResultData()
        return data ? React.createElement(ResultBoard, data) : null
    }
    // 결과판만 그림 (주소·판 알림 받기 없이, 판 끝 값은 스토어에서)
    view = render(React.createElement(Board))
    await flush(5)
}
// 1번 자리 줄의 "신고" → 신고 시트
async function openReportFor(i = 1) {
    const row = buttonNamed(`${NAMES[i]} 신고`)
    assert.ok(row, `${NAMES[i]} 줄의 신고 단추가 없음`)
    click(row)
    await flush()
    const sheet = document.querySelector('[data-testid="report-sheet"]')
    assert.ok(sheet, "신고 시트가 안 열림")
    return sheet
}
const radio = (sheet, label) => [...sheet.querySelectorAll('[role="radio"]')].find((b) => textOf(b) === label) ?? null

test("A13-M-002 신고 시트 사유·기타 메모: 사유 4개 글(PC와 같음), 기타 + 빈 메모 → '기타 사유는 메모를 적어 주세요.'", async () => {
    await resultBoard()
    const sheet = await openReportFor()
    const labels = [...sheet.querySelectorAll('[role="radio"]')].map(textOf)
    assert.deepEqual(labels, REPORT_REASONS.map((r) => r.label))
    assert.equal(labels.length, 4)
    click(radio(sheet, "기타"))
    click(sheet.querySelector('[data-testid="report-submit"]'))
    await flush()
    const message = sheet.querySelector('[data-testid="report-message"]')
    assert.ok(message, "메모 안내 글이 없음")
    assert.equal(textOf(message), "기타 사유는 메모를 적어 주세요.")
})

test("A13-M-003 신고 시트 중복 → 신고됨: 409 DUPLICATE_REPORT → '이미 이 판에서 신고한 플레이어입니다.', 줄 '신고됨'", async () => {
    await resultBoard({ status: 409, body: { success: false, code: "DUPLICATE_REPORT", message: "이미 신고함" } })
    const sheet = await openReportFor()
    click(radio(sheet, REPORT_REASONS[0].label))
    click(sheet.querySelector('[data-testid="report-submit"]'))
    await flush(5)
    assert.equal(textOf(sheet.querySelector('[data-testid="report-message"]')), "이미 이 판에서 신고한 플레이어입니다.")
    const done = buttonNamed(`${NAMES[1]} 신고됨`)
    assert.ok(done, "그 줄이 '신고됨'으로 안 바뀜")
    assert.equal(done.disabled, true)
})
