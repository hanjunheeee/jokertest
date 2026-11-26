// 모바일 결과판 시험: MVP 자리 없음, 마녀사냥꾼 이름, 골드 칸 없음, 10명 빈 칸 없음, 이긴 진영 띠·패배 띠
// 목록 A07 모바일 A07-M-001·002·004·006~008 (돌리기: frontend-mobile 폴더에서 node --test tests/a07-result-board.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { pageText, textOf } from "./a00-kit.mjs"
import { NAMES, ROLE_TEAM, resetGame, seat, uuidOf, useInGameStore } from "./a00-game.mjs"

const { default: ResultBoard } = await import("@m/domains/game/result/components/board/ResultBoard.jsx")
const { useGameResultData } = await import("@/domains/game/result/hooks/useGameResultData.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 서버가 판 끝에 주는 결과 (winResult) 모양, roles = 자리별 직업, gold = 자리별 판 골드
function winResult({ roles, winner, gold }) {
    return {
        winner,
        reveals: roles.map((role, i) => ({
            uuid: uuidOf(i), nickname: NAMES[i], role, team: ROLE_TEAM[role], alive: true, deathReason: null, goldReward: gold[i] ?? 0,
        })),
    }
}

// 결과판 그리기: 스토어에 끝난 판(내 자리 0) → 결과 화면 값 → 모바일 결과판
function drawBoard({ roles, winner, gold = [] }) {
    seat({ n: roles.length, role: roles[0], phase: "DAY" })
    act(() => {
        const state = useInGameStore.getState().state
        useInGameStore.setState({ state: { ...state, phase: "ENDED", winResult: winResult({ roles, winner, gold }) } })
    })
    function Board() {
        const data = useGameResultData()
        return data ? React.createElement(ResultBoard, data) : React.createElement("p", null, "결과 없음")
    }
    view = render(React.createElement(Board))
    return view
}
const rows = () => [...document.querySelectorAll('section[aria-label="가면무도회 참가자 정체"] li')]
const goldBadges = () => [...document.querySelectorAll('[data-testid="game-result-gold-reward"]')]
const EIGHT = ["CITIZEN", "JOKER", "JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN", "CITIZEN"]

test("A07-M-001 MVP 자리 없음: 8명 결과판 → MVP 카드·'MVP' 글 없음", () => {
    drawBoard({ roles: EIGHT, winner: "CITIZEN", gold: Array(8).fill(1) })
    assert.equal(rows().length, 8, "결과판이 안 그려짐")
    assert.ok(!/MVP/i.test(pageText()), "MVP 글이 보임")
})

test("A07-M-002 마녀사냥꾼 이름: 마녀사냥꾼 줄 → '마녀사냥꾼'", () => {
    drawBoard({ roles: EIGHT, winner: "CITIZEN" })
    const row = rows().find((li) => textOf(li).includes(NAMES[5]))
    assert.ok(row, "마녀사냥꾼 자리 줄이 없음")
    assert.ok(textOf(row).includes("마녀사냥꾼"), `줄 글: ${textOf(row)}`)
})

test("A07-M-003 판 골드 받음: 전원 1골드여도 내 줄에만 '+1골드' 1개 표시", () => {
    drawBoard({ roles: EIGHT, winner: "CITIZEN", gold: Array(8).fill(1) })
    const badges = goldBadges()
    assert.equal(badges.length, 1, "골드 배지가 내 줄 하나가 아님")
    assert.equal(textOf(badges[0]), "+1골드")
    const myRow = rows().find((li) => textOf(li).includes(NAMES[0]))
    assert.ok(myRow?.contains(badges[0]), "골드 배지가 내 줄에 없음")
})

test("A07-M-004 못 받으면 골드 없음: 내 골드 0 → 골드 칸 0", () => {
    drawBoard({ roles: EIGHT, winner: "JOKER", gold: [0] })
    assert.equal(goldBadges().length, 0)
})

test("A07-M-006 10명 결과판 빈 칸 없음: 10명 → 줄 10개, 이름 빈 줄 0", () => {
    const roles = ["CITIZEN", "JOKER", "JOKER", "DOCTOR", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN", "CITIZEN", "CITIZEN"]
    drawBoard({ roles, winner: "CITIZEN", gold: Array(10).fill(1) })
    assert.equal(rows().length, 10)
    const blank = rows().filter((li) => !NAMES.some((name) => textOf(li).includes(name)))
    assert.equal(blank.length, 0, "이름 없는 줄이 있음")
})

test("A07-M-007 이긴 진영 띠: 광대 승 → '광대 진영 승리'", () => {
    drawBoard({ roles: ["JOKER", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"], winner: "JOKER" })
    assert.ok(pageText().includes("광대 진영 승리"), `글: ${pageText().slice(0, 120)}`)
})

test("A07-M-008 진 편 띠: 내 편(시민) 짐 → '패배'", () => {
    drawBoard({ roles: EIGHT, winner: "JOKER" })
    assert.ok(pageText().includes("패배"), `글: ${pageText().slice(0, 120)}`)
    assert.ok(!pageText().includes("승리") || pageText().includes("광대 진영 승리"), "진 편인데 '승리' 띠")
})
