// 모바일 재판 화면 시험: 폰 세로 최후의 변론 시트 닫기 뒤 다시 열기·유죄 표, 넓은 배치 재판 창(TribunalGate/TribunalOverlay) 피고 카드·유죄·무죄·반론 채팅·피고 안내
// 목록 A04 모바일 A04-M-601~605 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-m6-tribunal.test.js)
// 폰 세로: 피고 등장 연출(TribunalTalkPresentation) → 채팅방 "최후의 변론" 단추 → 시트(TribunalSheet), 넓은 배치: 재판 창이 바로 화면을 덮고 1초 뒤 반론 채팅
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import {
    GAME, NAMES, fakeSocket, fire, openTribunalSheet, renderPage, resetGame, seat, tribunalBox, tribunalEntry, tribunalSheet, wideLayout,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const reopenButton = () => document.querySelector('[data-testid="tribunal-presentation-open"]')
const tribunalChat = () => tribunalBox()?.querySelector('[aria-label="최후의 반론 채팅"]') ?? null

// n명 판 1일 투표 → 재판 (피고 = defendant 자리, 나는 0번 자리), wide면 넓은 배치
async function tribunalPage({ n, defendant = 3, wide = false, acks = {} }) {
    if (wide) wideLayout(true)
    const socket = fakeSocket({ acks })
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n, defendant }))
    return socket
}
// 재판 창 채팅이 열릴 때까지 기다림 (피고 카드가 먼저 크게 뜨고 1초 뒤 나뉨)
async function waitTribunalChat() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)) })
    await flush()
}

test("A04-M-601 최후의 변론 시트 닫기 뒤 다시 열기 (6명 판): 시트 '최후의 변론 닫기' → 시트 없음·채팅방 '최후의 변론' 단추 남음 → 다시 누르면 시트·유죄·무죄", async () => {
    await tribunalPage({ n: 6 })
    const sheet = await openTribunalSheet()
    assert.ok(textOf(sheet).includes(`피고: ${NAMES[3]}`), `시트 부제: ${textOf(sheet)}`)
    click(buttonNamed("최후의 변론 닫기", sheet))
    await flush()
    await waitUntil(() => tribunalSheet() === null, { label: "시트 닫힘" })
    assert.ok(reopenButton(), "닫은 뒤 '최후의 변론' 단추가 없음")
    click(reopenButton())
    await flush()
    assert.ok(tribunalSheet(), "다시 누르는데 시트가 안 열림")
    for (const name of ["유죄", "무죄"]) assert.ok(buttonNamed(name, tribunalSheet()), `다시 연 시트에 ${name} 단추가 없음`)
})

test("A04-M-602 최후의 변론 시트 유죄 누름 (7명 판) → cast_tribunal_vote 1번 vote 'GUILTY'", async () => {
    const socket = await tribunalPage({ n: 7, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "GUILTY" } } })
    await openTribunalSheet()
    click(buttonNamed("유죄", tribunalSheet()))
    await flush()
    const sent = socket.sentOf("cast_tribunal_vote")
    assert.equal(sent.length, 1, "재판 표가 안 나감")
    assert.equal(sent[0]?.vote, "GUILTY")
})

test("A04-M-603 폰 세로 재판 진입 (5명 판) → 피고 등장 연출엔 유죄·무죄·반론 채팅 없음, 채팅방 '최후의 변론' 단추는 연출이 닫힌 뒤에 생김", async () => {
    await tribunalPage({ n: 5 })
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    assert.equal(reopenButton(), null, "연출 중인데 '최후의 변론' 단추가 먼저 있음")
    assert.ok(!buttonNamed("유죄", tribunalBox()) && !buttonNamed("무죄", tribunalBox()), "연출에 유죄·무죄 단추가 보임")
    assert.equal(tribunalChat(), null, "폰 세로 연출에 반론 채팅이 있음")
    await openTribunalSheet()
    assert.equal(tribunalBox(), null, "연출이 안 닫힘")
})

test("A04-M-604 넓은 배치 재판 창 (8명 판) → 피고 카드·'유죄'·'무죄' 바로, 1초 뒤 '최후의 반론 채팅'(입력칸 있음), 유죄 누르면 cast_tribunal_vote 'GUILTY'", async () => {
    const socket = await tribunalPage({ n: 8, wide: true, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "GUILTY" } } })
    const box = tribunalBox()
    assert.ok(box, "넓은 배치 재판 창이 없음")
    assert.ok(box.querySelector('[data-tribunal-defendant="p3"]'), "재판 창에 피고 카드가 없음")
    for (const name of ["유죄", "무죄"]) assert.ok(buttonNamed(name, box), `재판 창에 ${name} 단추가 없음`)
    assert.equal(document.querySelector('[data-testid="tribunal-presentation-sheet"]'), null, "넓은 배치에 폰 세로 시트가 뜸")
    await waitTribunalChat()
    assert.ok(tribunalChat(), "1초 뒤 반론 채팅이 안 열림")
    assert.ok(tribunalChat().querySelector('textarea[aria-label="채팅 입력"]'), "반론 채팅 입력칸이 없음")
    click(buttonNamed("유죄", tribunalBox()))
    await flush()
    assert.deepEqual(socket.sentOf("cast_tribunal_vote").map((p) => p.vote), ["GUILTY"])
})

test("A04-M-605 넓은 배치 재판 창 내가 피고 (6명 판) → 유죄·무죄 없음, '당신은 피고인입니다. 투표할 수 없습니다.'", async () => {
    await tribunalPage({ n: 6, defendant: 0, wide: true })
    const box = tribunalBox()
    assert.ok(box, "넓은 배치 재판 창이 없음")
    assert.ok(!buttonNamed("유죄", box) && !buttonNamed("무죄", box), "피고에게 단추가 보임")
    assert.ok(textOf(box).includes("당신은 피고인입니다. 투표할 수 없습니다."), `재판 창 글: ${textOf(box)}`)
})
