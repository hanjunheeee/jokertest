// 모바일 밤·낮 시작 시험: 밤 차례 안내 창 글·확인, 직업 행동 목록(제목·부제·고른 뒤 취소하기), 낮 시작 연출 확인 → 스토어 값 지움, 암살 영상 실패면 글 창
// 목록 A05 모바일 A05-M-601~605 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-m6-night-dawn.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import {
    NAMES, closeNightTurn, fakeSocket, fire, nextDay, openRoster, readSheet, renderPage, resetGame, rosterItem, rosterSheet, seat, turnStarted,
    useInGameStore,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const nightTurnBox = () => document.querySelector("[data-night-turn-role]")
const dawnBox = (kind) => document.querySelector(`[data-ingame-dawn-report="${kind}"]`)
const killVideo = () => document.querySelector("[data-ingame-night-success-kill]")
const dawnReport = () => useInGameStore.getState().dawnReport

// n명 판 1일 밤 (나는 0번 자리 role)
async function nightPage({ n, role = "CITIZEN", allies } = {}) {
    const socket = fakeSocket()
    seat({ n, role, allies, phase: "NIGHT", dayIndex: 1 })
    view = await renderPage(socket)
    return socket
}

test("A05-M-601 밤 차례 안내 (7명 판, 나는 의사): 광대 차례 시작 → 안내 창 '광대의 시간입니다'·'밤이 깊어갑니다'·'확인', 확인 누르면 닫힘", async () => {
    const socket = await nightPage({ n: 7, role: "DOCTOR" })
    await fire(socket, "night_turn_started", turnStarted({ role: "JOKER" }))
    const box = nightTurnBox()
    assert.ok(box, "밤 차례 안내 창이 없음")
    assert.equal(box.getAttribute("data-night-turn-role"), "JOKER")
    assert.ok(textOf(box).includes("광대의 시간입니다"), `안내 글: ${textOf(box)}`)
    assert.ok(textOf(box).includes("밤이 깊어갑니다"), `안내 글: ${textOf(box)}`)
    click(buttonNamed("확인", box))
    await flush()
    await waitUntil(() => nightTurnBox()?.querySelector('[role="dialog"]') == null, { label: "안내 창 닫힘" })
})

test("A05-M-602 직업 행동 목록 (6명 판 의사 차례): 채팅방 '직업 행동' 단추 → 시트 제목 '직업행동'·부제 '대상을 고르세요.', 2번 '보호' 누르면 submit_night_action 1번(대상 p2)", async () => {
    const socket = await nightPage({ n: 6, role: "DOCTOR" })
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    await closeNightTurn()
    const opener = document.querySelector('[data-testid="player-roster-open"]')
    assert.equal(opener?.getAttribute("aria-label"), "직업 행동")
    assert.equal(opener.getAttribute("data-roster-mode"), "night")
    await openRoster()
    assert.equal(textOf(rosterSheet().querySelector("h2")), "직업행동")
    assert.ok(textOf(rosterSheet()).includes("대상을 고르세요."), `시트 글: ${textOf(rosterSheet())}`)
    act(() => { rosterItem(2, "보호").click() })
    await flush(6)
    assert.deepEqual(socket.sentOf("submit_night_action").map((p) => p.targetId), ["p2"])
})

test("A05-M-603 밤 대상을 고른 뒤 (6명 판 의사): 고른 줄은 '취소하기'(켜짐), 다른 줄은 '보호'", async () => {
    const socket = await nightPage({ n: 6, role: "DOCTOR" })
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    await closeNightTurn()
    await openRoster()
    act(() => { rosterItem(2, "보호").click() })
    await flush(6)
    assert.equal(socket.sentOf("submit_night_action").length, 1, "밤 행동이 안 나감 (준비 잘못)")
    act(() => { document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })) })
    await flush()
    const picked = await readSheet(2)
    assert.deepEqual(picked, [{ name: "취소하기", enabled: true, kind: "NIGHT_ACTION_CANCEL" }])
    const other = await readSheet(3)
    assert.deepEqual(other.map((item) => item.name), ["보호"])
})

test("A05-M-604 낮 시작 글 창 확인 (6명 판, 아무도 안 죽음) → 창 닫힘, 스토어 낮 시작 연출 값 지워짐(finishDawnReport)", async () => {
    const socket = await nightPage({ n: 6 })
    await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
    assert.ok(dawnBox("QUIET"), "낮 시작 글 창이 없음")
    assert.equal(dawnReport()?.kind, "QUIET", "스토어에 낮 시작 연출 값이 없음 (준비 잘못)")
    click(buttonNamed("확인", dawnBox("QUIET")))
    await flush()
    assert.equal(dawnReport(), null, "확인 뒤에도 스토어 값이 남음")
    await waitUntil(() => dawnBox("QUIET")?.querySelector('[role="dialog"]') == null, { label: "글 창 닫힘" })
})

test("A05-M-605 암살 영상이 못 열림 (7명 판, 3번 죽음) → 글 창 '지난밤 라온님이 살해당했습니다', 확인 → 스토어 값 지워짐", async () => {
    const socket = await nightPage({ n: 7 })
    await fire(socket, "night_result_applied", nextDay({ n: 7, dead: [3], victim: 3, deadline: Date.now() + 60_000 }))
    assert.ok(killVideo(), "암살 영상 연출이 없음 (준비 잘못)")
    const video = document.querySelector("[data-ingame-night-success-source-video]")
    act(() => { video.dispatchEvent(new window.Event("error")) })
    await flush()
    await waitUntil(() => dawnBox("KILLED") !== null, { label: "영상 실패 뒤 글 창" })
    assert.equal(killVideo(), null, "영상 창이 남음")
    assert.ok(textOf(dawnBox("KILLED")).includes(`지난밤 ${NAMES[3]}님이 살해당했습니다`), `글 창: ${textOf(dawnBox("KILLED"))}`)
    assert.ok(dawnReport(), "영상 실패만으로 스토어 값이 지워짐")
    click(buttonNamed("확인", dawnBox("KILLED")))
    await flush()
    assert.equal(dawnReport(), null, "확인 뒤에도 스토어 값이 남음")
})
