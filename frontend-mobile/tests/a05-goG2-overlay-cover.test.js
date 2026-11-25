// 모바일 밤 안내와 열어 둔 창 시험: 죽은 사람의 밤 안내는 설정 시트를 그대로 둠, 투표 현황 창은 밤 안내가 떠도·확인 뒤에도 그대로
// 목록 A05b 모바일 A05-M-513·514 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-goG2-overlay-cover.test.js)
// 연출이 뜨면 설정·전적 시트(방 코드·신고 창)·채팅 크게 보기를 저절로 닫던 규칙은 지금 화면에 없음 → 그 시험(A05-M-509~512·515~518)은 뺌
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import { confirmEntrances, dayResolved, fakeSocket, fire, renderPage, resetGame, seat, useInGameStore } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 창이 떠 있는지 (참거짓만 비교에 넣음 — 화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const shown = (id) => document.querySelector(`[data-testid="${id}"]`) !== null
const dialogShown = (label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`) !== null
const entranceShown = () => dialogShown("단계 전환 안내")
const voteStatusShown = () => dialogShown("투표 현황")

// 이름으로 단추 눌러 창 열기
async function open(name) {
    const button = buttonNamed(name)
    assert.ok(button, `"${name}" 단추가 없음 (준비 잘못)`)
    click(button)
    await flush()
}
// n명 판 화면 (나는 0번 자리), 처음 뜬 단계 안내는 확인으로 닫음
async function page(seatOptions) {
    const socket = fakeSocket()
    seat(seatOptions)
    view = await renderPage(socket)
    await confirmEntrances()
    return socket
}
// 낮 판정(동점) → 밤: "밤이 되었습니다" 안내가 뜸
const toNight = (socket, n) => fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: n, abstain: 0 }))

test("A05-M-513 죽은 사람의 밤 안내는 잠그지 않음 (7명 판, 나는 죽음): 설정 시트를 연 채 밤이 됨 → 설정 시트 그대로", async () => {
    const socket = await page({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE", dead: [0] })
    // 죽은 채 들어오면 사망 선택 창이 먼저 뜸 → 관전 계속을 골라 닫음
    await open("관전 계속하기")
    await open("인게임 설정")
    assert.equal(shown("settings-sheet"), true, "설정 시트가 안 열림 (준비 잘못)")
    await toNight(socket, 7)
    assert.equal(useInGameStore.getState().state.phase, "NIGHT", "밤으로 안 넘어감 (준비 잘못)")
    assert.equal(shown("settings-sheet"), true, "잠그지 않는 안내인데 설정 시트가 닫힘")
})

test("A05-M-514 투표 현황 창은 밤 안내가 떠도 그대로 (5명 판): 전원 기권 → 밤 안내 → 창 남음, 확인 뒤에도 남음", async () => {
    const socket = await page({ n: 5, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("투표 현황 열기")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 5, abstain: 5 }))
    assert.equal(entranceShown(), true, "밤 안내 창이 안 뜸 (준비 잘못)")
    assert.equal(voteStatusShown(), true, "투표 현황 창이 닫힘")
    await confirmEntrances()
    assert.equal(voteStatusShown(), true, "확인 뒤 투표 현황 창이 닫힘")
})
