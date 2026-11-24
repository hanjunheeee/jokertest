// 모바일 나가기 확인 창 글 시험: 산 사람은 패배·골드·탈주 제한 글, 죽은 사람은 벌 없음 글
// 목록 A09 모바일 A09-M-005·006 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-exit-confirm.test.js)
// 판 중 위 줄 "게임 나가기" 단추는 2026-11-24 새 배치에서 없어짐 (사용자 결정 전) → 산 사람은 뒤로 가기, 죽은 사람은 사망 후 선택 창 "게임 나가기"로 확인 창을 띄움
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import { confirms, fakeSocket, renderPage, resetGame, router, seat } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 나가기를 골라 뜬 확인 창 글 (산 사람은 뒤로 가기, 죽은 사람은 사망 후 선택 창의 "게임 나가기")
async function pressExit({ dead }) {
    const socket = fakeSocket()
    seat({ n: 7, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: dead ? [0] : [], deadline: Date.now() + 60_000 })
    view = await renderPage(socket, { before: ["/multiplay"] })
    if (dead) {
        const panel = document.querySelector('[role="dialog"][aria-label="사망 후 선택"]')
        assert.ok(panel, "사망 후 선택 창이 없음")
        click(buttonNamed("게임 나가기", panel))
    } else {
        await act(async () => { await router.navigate(-1) })
    }
    await flush()
    assert.ok(confirms.length > 0, "나가기 확인 창이 안 뜸")
    return confirms.at(-1)
}

test("A09-M-005 모바일 나가기 확인 창 글: 산 사람 → 패배·골드·탈주 제한 글", async () => {
    const text = await pressExit({ dead: false })
    assert.match(text, /게임에서 나가시겠습니까\?/)
    assert.match(text, /패배/)
    assert.match(text, /골드/)
    assert.match(text, /다른 방에 들어갈 수 없습니다/)
})

test("A09-M-006 모바일 나가기 확인 창 글: 죽은 사람 → 벌 없음 글", async () => {
    const text = await pressExit({ dead: true })
    assert.match(text, /탈주가 아니며/)
    assert.ok(!/패배/.test(text), "죽은 사람에게 패배 글")
    assert.ok(!/다른 방에 들어갈 수 없습니다/.test(text), "죽은 사람에게 탈주 제한 글")
})
