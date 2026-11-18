// 모바일 시민 직업 화면 이름 시험: 역할 창·결과판·방 만들기 직접 지정에서 "귀족"으로 보임 (진영 글 "시민 진영"은 그대로)
// 결정 2026-11-16 낮 셋째 8번 (돌리기: frontend-mobile 폴더에서 node --test tests/goN-citizen-name.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, pageText, textOf } from "./a00-kit.mjs"
import { NAMES, ROLE_TEAM, resetGame, seat, uuidOf, useInGameStore } from "./a00-game.mjs"

const { default: RoleRevealOverlay } = await import("@m/domains/game/ingame/components/overlays/RoleRevealOverlay.jsx")
const { getInGameRoleRevealInfo } = await import("@/domains/game/ingame/utils/roleReveal.js")
const { default: ResultBoard } = await import("@m/domains/game/result/components/board/ResultBoard.jsx")
const { useGameResultData } = await import("@/domains/game/result/hooks/useGameResultData.js")
const { default: SetupPanel } = await import("@m/domains/game/setup/components/SetupPanel.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

test("N-M-001 모바일 역할 창: 시민 직업(6명 판) → 직업 이름 줄 \"귀족\", 직업 이름으로 \"시민\"은 없음", () => {
    const self = { uuid: "u0", nickname: "가", role: "CITIZEN", team: "CITIZEN" }
    const roleInfo = getInGameRoleRevealInfo(self, { authUuid: "u0" })
    assert.ok(roleInfo, "역할 공개 값이 안 만들어짐")
    const list = NAMES.slice(0, 6).map((nickname, i) => ({ uuid: `u${i}`, nickname }))
    view = render(React.createElement(RoleRevealOverlay, { open: true, onClose: () => {}, roleInfo, players: list }))
    const box = document.querySelector("[data-ingame-role-reveal]")
    assert.ok(box, "역할 창이 없음")
    const lines = [...box.querySelectorAll("p")].map((p) => textOf(p))
    assert.ok(lines.includes("귀족"), `직업 이름 줄: ${JSON.stringify(lines)}`)
    assert.ok(!lines.includes("시민"), "직업 이름이 \"시민\"으로 보임")
})

test("N-M-002 모바일 결과판: 8명 판 시민 직업 줄 3개 → 직업 글 \"귀족\", 줄 안에 \"시민\" 글 없음", () => {
    const roles = ["CITIZEN", "JOKER", "JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN", "CITIZEN"]
    seat({ n: roles.length, role: roles[0], phase: "DAY" })
    act(() => {
        const state = useInGameStore.getState().state
        const reveals = roles.map((role, i) => ({
            uuid: uuidOf(i), nickname: NAMES[i], role, team: ROLE_TEAM[role], alive: true, deathReason: null, goldReward: 0,
        }))
        useInGameStore.setState({ state: { ...state, phase: "ENDED", winResult: { winner: "CITIZEN", reveals } } })
    })
    function Board() {
        const data = useGameResultData()
        return data ? React.createElement(ResultBoard, data) : React.createElement("p", null, "결과 없음")
    }
    view = render(React.createElement(Board))
    const rows = [...document.querySelectorAll('section[aria-label="가면무도회 참가자 정체"] li')]
    assert.equal(rows.length, 8, "결과판이 안 그려짐")
    const nobleNames = rows.filter((li) => textOf(li).includes("귀족")).map((li) => NAMES.find((name) => textOf(li).includes(name)))
    assert.deepEqual(nobleNames, [NAMES[0], NAMES[6], NAMES[7]])
    assert.equal(rows.filter((li) => textOf(li).includes("시민")).length, 0, "줄에 \"시민\" 글이 보임")
})

test("N-M-003 모바일 방 만들기 직접 지정(정원 10·처음 값 광대 1) → \"귀족: 9명 (자동 계산)\"과 \"귀족 수는 …\" 안내 글", () => {
    view = render(React.createElement(SetupPanel, { isCreating: false, onCreateGame: () => {} }))
    click(buttonNamed("역할 구성 증가"))
    const text = pageText()
    assert.ok(text.includes("직접 지정"), "직접 지정으로 안 바뀜")
    assert.ok(text.includes("귀족: 9명 (자동 계산)"), `요약 글이 다름: ${text}`)
    assert.ok(text.includes("귀족 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다."), "안내 글이 다름")
    assert.ok(!text.includes("시민:") && !text.includes("시민 수는"), "직업 이름이 \"시민\"으로 보임")
})
