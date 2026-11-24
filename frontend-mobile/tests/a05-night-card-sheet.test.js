// 모바일 밤 카드 시트 시험: 동료 광대 카드엔 밤 행동 없음, 의사는 자기 카드에도, 마녀사냥꾼은 죽은 사람 카드에만, 둘째 밤 같은 대상 다시 고르기
// 폰 세로는 카드 띠 대신 "직업 행동" 단추로 여는 플레이어 목록 시트 줄에 카드 메뉴와 같은 항목이 붙음 (2026-11-24 새 배치)
// 목록 A05a 모바일 A05-M-001~003·008 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-night-card-sheet.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { flush } from "./a00-kit.mjs"
import {
    closeNightTurn, confirmEntrances, dayToNight, fakeSocket, fire, nextDay, openRoster, readSheet, renderPage, resetGame, rosterItem, rosterItems, seat, turnEnded,
    turnStarted,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 직업별 밤 행동 단추 이름 (화면 글)
const NIGHT_LABEL = { JOKER: "암살", DOCTOR: "보호", GUARD: "조사", WITCH_HUNTER: "확인" }

// 밤 차례 화면: n명 판, 나는 0번 자리 role, 그 직업 차례 시작
async function nightTurnPage({ n, role, allies, dead = [], dayIndex = 1 }) {
    const socket = fakeSocket()
    seat({ n, role, allies, dead, phase: "NIGHT", dayIndex })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role, dayIndex }))
    await closeNightTurn()
    return socket
}
const nightItem = (items, role) => items.find((item) => item.name === NIGHT_LABEL[role]) ?? null

test("A05-M-001 광대 목록 밤 항목 (7명 광대2): 동료 광대 줄에 밤 행동 없음, 시민 줄엔 있음", async () => {
    await nightTurnPage({ n: 7, role: "JOKER", allies: [3] })
    const ally = await readSheet(3)
    assert.ok(!nightItem(ally, "JOKER"), `동료 광대 카드에 암살이 있음: ${JSON.stringify(ally)}`)
    const citizen = await readSheet(2)
    assert.ok(nightItem(citizen, "JOKER"), `시민 카드에 암살이 없음: ${JSON.stringify(citizen)}`)
    assert.equal(nightItem(citizen, "JOKER").enabled, true)
})

test("A05-M-002 의사 자기 줄: 의사 차례 → 목록 내 줄에 밤 행동(보호) 있음", async () => {
    await nightTurnPage({ n: 6, role: "DOCTOR" })
    const mine = await readSheet(0)
    assert.ok(nightItem(mine, "DOCTOR"), `내 카드에 보호가 없음: ${JSON.stringify(mine)}`)
    assert.equal(nightItem(mine, "DOCTOR").enabled, true)
})

test("A05-M-003 마녀사냥꾼 둘째 밤: 죽은 사람 줄에만 밤 행동(확인)", async () => {
    await nightTurnPage({ n: 8, role: "WITCH_HUNTER", dead: [4], dayIndex: 2 })
    const deadCard = await readSheet(4)
    assert.ok(nightItem(deadCard, "WITCH_HUNTER")?.enabled, `죽은 사람 카드에 눌리는 확인이 없음: ${JSON.stringify(deadCard)}`)
    const aliveCard = await readSheet(2)
    // 산 사람 카드: 확인 항목이 없거나 꺼져 있음 (PC 시험과 같은 뜻 — 누를 수 있는 밤 행동 없음)
    assert.ok(!nightItem(aliveCard, "WITCH_HUNTER")?.enabled, `산 사람 카드에 눌리는 확인이 있음: ${JSON.stringify(aliveCard)}`)
})

test("A05-M-008 둘째 밤 같은 대상 다시 (6명 의사): 첫 밤 A 고름 → 둘째 밤 목록 A 줄 밤 행동 켜짐", async () => {
    const socket = await nightTurnPage({ n: 6, role: "DOCTOR" })
    // 첫 밤: 목록에서 2번 자리 보호
    await openRoster()
    const first = rosterItems(2).find((item) => item.name === "보호")
    assert.ok(first && first.enabled, `첫 밤 보호 단추가 없음: ${JSON.stringify(rosterItems(2))}`)
    act(() => { rosterItem(2, "보호").click() })
    await flush()
    assert.deepEqual(socket.sentOf("submit_night_action").map((p) => p.targetId), ["p2"], "첫 밤 보호가 안 나감")
    // 밤 끝 → 2일 낮 → 모두 기권 → 둘째 밤 의사 차례
    await fire(socket, "night_turn_ended", turnEnded({ role: "DOCTOR" }))
    await fire(socket, "night_actions_resolved", { gameId: "g-m1", dayIndex: 1 })
    await fire(socket, "night_result_applied", nextDay({ n: 6, dayIndex: 2, deadline: Date.now() + 60_000 }))
    await dayToNight(socket, { n: 6, dayIndex: 2 })
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR", dayIndex: 2 }))
    await confirmEntrances()
    await closeNightTurn()
    const again = await readSheet(2)
    assert.ok(nightItem(again, "DOCTOR"), `둘째 밤 같은 대상 카드에 보호가 없음: ${JSON.stringify(again)}`)
    assert.equal(nightItem(again, "DOCTOR").enabled, true, "둘째 밤 같은 대상 보호가 꺼짐")
})
