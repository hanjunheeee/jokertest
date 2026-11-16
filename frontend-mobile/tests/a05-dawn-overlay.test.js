// 모바일 낮 시작 연출 시험 [버그 5]: 죽음은 영상 + 글(모두에게), 살림은 글 창, 없으면 "낮이 되었습니다"만, 연출 뒤 낮 문구·결과 화면, 채팅 알림 줄
// 목록 A05b 모바일 A05-M-501~505·508 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-dawn-overlay.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { GAME, NAMES, fakeSocket, fire, nextDay, renderPage, resetGame, router, seat, uuidOf } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const killVideo = () => document.querySelector("[data-ingame-night-success-kill]")
const dawnBox = (kind) => document.querySelector(kind ? `[data-ingame-dawn-report="${kind}"]` : "[data-ingame-dawn-report]")
const entranceText = () => textOf(document.querySelector('[role="dialog"][aria-label="단계 전환 안내"]'))
const talkText = () => textOf(document.querySelector('[data-talk-layout] [data-slot="chat"]'))

// n명 판 1일 밤 (나는 0번 시민, roles: 내 직업)
async function nightPage(n, { role = "CITIZEN", allies } = {}) {
    const socket = fakeSocket()
    seat({ n, role, allies, phase: "NIGHT", dayIndex: 1 })
    view = await renderPage(socket)
    return socket
}
// 암살 영상 끝 (영상 끝 사건)
async function endKillVideo() {
    const video = document.querySelector("[data-ingame-night-success-source-video]")
    assert.ok(video, "암살 영상이 없음")
    act(() => { video.dispatchEvent(new window.Event("ended")) })
    await flush()
}

test("A05-M-501 [버그 5] 죽음 연출은 영상 + 글 (6명): KILLED → 암살 영상, 글 '지난밤 A님이 살해당했습니다'", async () => {
    const socket = await nightPage(6)
    await fire(socket, "night_result_applied", nextDay({ n: 6, dead: [2], victim: 2, deadline: Date.now() + 60_000 }))
    assert.ok(killVideo(), "암살 영상 연출이 없음 (나는 광대도 당한 사람도 아님)")
    const msg = textOf(document.querySelector("[data-ingame-dawn-report-message]"))
    assert.ok(msg.includes(`지난밤 ${NAMES[2]}님이 살해당했습니다`), `글: ${msg}`)
})

test("A05-M-502 살림 연출은 글 창 (7명): SAVED → 살림 글 창, 영상 없음", async () => {
    const socket = await nightPage(7)
    await fire(socket, "night_result_applied", nextDay({ n: 7, doctorSaved: true, deadline: Date.now() + 60_000 }))
    assert.ok(dawnBox("SAVED"), "살림 글 창이 없음")
    assert.match(textOf(dawnBox("SAVED")), /살려/)
    assert.ok(killVideo() === null, "살림인데 암살 영상이 뜸")
})

test("A05-M-503 아무 일 없으면 연출 없이 '낮이 되었습니다' (8명): 두 표시 없음, 낮 문구", async () => {
    const socket = await nightPage(8)
    await fire(socket, "night_result_applied", nextDay({ n: 8, deadline: Date.now() + 60_000 }))
    assert.ok(killVideo() === null, "암살 영상이 뜸")
    assert.ok(dawnBox() === null, "낮 시작 글 창이 뜸")
    assert.ok(entranceText().includes("낮이 되었습니다"), `낮 문구가 없음: ${entranceText()}`)
})

test("A05-M-504 연출 → '낮이 되었습니다' 차례 (6명): KILLED 연출 중 낮 문구 없음 → 닫은 뒤 낮 문구", async () => {
    const socket = await nightPage(6)
    await fire(socket, "night_result_applied", nextDay({ n: 6, dead: [3], victim: 3, deadline: Date.now() + 60_000 }))
    assert.ok(killVideo(), "암살 영상 연출이 없음")
    assert.ok(!entranceText().includes("낮이 되었습니다"), "연출 중에 낮 문구가 먼저 뜸")
    await endKillVideo()
    await waitUntil(() => entranceText().includes("낮이 되었습니다"), { label: "연출 뒤 낮 문구" })
})

test("A05-M-505 [임시 9] 밤 암살로 판 끝 → 연출 뒤 결과 화면 (5명, 광대 2): 연출 중 결과 화면 아님, 닫은 뒤 결과 화면", async () => {
    const socket = await nightPage(5)
    await fire(socket, "night_result_applied", {
        gameId: GAME,
        phase: "ENDED",
        dayIndex: 1,
        players: Array.from({ length: 5 }, (_, i) => ({ uuid: uuidOf(i), isAlive: i !== 2 })),
        victimUuid: uuidOf(2),
        deathReveals: [{ victimUuid: uuidOf(2), source: "JOKER" }],
        doctorSaved: false,
        winResult: { winner: "JOKER" },
        resultClosesAt: Date.now() + 180_000,
    })
    assert.ok(killVideo(), "판 끝 암살 연출이 없음")
    assert.equal(router.state.location.pathname, "/ingame", "연출 중에 결과 화면으로 감")
    await endKillVideo()
    await waitUntil(() => router.state.location.pathname === "/gameresult", { label: "연출 뒤 결과 화면" })
})

test("A05-M-508 채팅 알림 줄 (7명): 죽음 → 채팅에 '지난밤 A님이 살해당했습니다' 줄 / 살림 → 살해 줄 없음", async () => {
    let socket = await nightPage(7)
    await fire(socket, "night_result_applied", nextDay({ n: 7, dead: [4], victim: 4, deadline: Date.now() + 60_000 }))
    await endKillVideo()
    assert.ok(talkText().includes(`지난밤 ${NAMES[4]}님이 살해당했습니다`), `채팅방: ${talkText()}`)
    resetGame(view)
    view = null
    socket = await nightPage(7)
    await fire(socket, "night_result_applied", nextDay({ n: 7, doctorSaved: true, deadline: Date.now() + 60_000 }))
    const okBtn = dawnBox("SAVED") ? buttonNamed("확인", dawnBox("SAVED")) : null
    if (okBtn) click(okBtn)
    await flush()
    assert.ok(!talkText().includes("살해당했습니다"), `살림인데 살해 줄이 있음: ${talkText()}`)
})
