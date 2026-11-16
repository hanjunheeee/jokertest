// 모바일 카드 이름판 띠 시험: 초상 띠·카드 이름이 띠 칸 안에 그려지고, 띠는 그 사람 색에 맞는 쪽 (죽은 사람·끊긴 사람·동료 카드 포함)
// 목록 A02-M-009~011 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md), 결정 2026-11-16 낮 "카드 이름판에만 어두운 띠" (돌리기: frontend-mobile 폴더에서 node --test tests/a02-goU-nameplate-band.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { NAMES, fakeSocket, renderPage, resetGame, seat, stripSlot } from "./a00-game.mjs"

const { INGAME_PLAYER_THEME_PALETTE } = await import("@/shared/constants/ingamePlayerTheme.js")
const { pickNameplateBand } = await import("@/domains/game/ingame/utils/nameplateBand.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 칸 안 띠 (이름 글이 든 칸)
const bandsIn = (root) => [...root.querySelectorAll("[data-ingame-nameplate-band]")]

test("A02-M-009 10명 판 초상 띠 → 칸마다 이름 글이 띠 칸 하나 안에, 띠는 그 사람 색에 맞는 쪽", async () => {
    seat({ n: 10, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(fakeSocket())
    for (let i = 0; i < 10; i += 1) {
        const bands = bandsIn(stripSlot(i))
        assert.equal(bands.length, 1, `${NAMES[i]} 칸 띠 수`)
        assert.equal(bands[0].textContent, NAMES[i])
        assert.equal(bands[0].getAttribute("data-ingame-nameplate-band"), pickNameplateBand(INGAME_PLAYER_THEME_PALETTE[i].color), NAMES[i])
    }
})

test("A02-M-010 죽은 사람·끊긴 사람 카드 → 이름은 그대로 띠 칸 안 (흐림·상태 표시와 따로)", async () => {
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: [2], disconnected: [4] })
    view = await renderPage(fakeSocket())
    for (const i of [2, 4]) {
        const bands = bandsIn(stripSlot(i))
        assert.equal(bands.length, 1)
        assert.equal(bands[0].textContent, NAMES[i])
        assert.equal(bands[0].parentElement.tagName, "P", "이름판 칸 안")
    }
})

test("A02-M-011 동료 카드 → 띠 칸과 '동료' 표시가 같이 있음, 띠는 이름판 폭 안에서 잘림", async () => {
    seat({ n: 8, role: "DOCTOR", allies: [3], phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(fakeSocket())
    const slot = stripSlot(3)
    assert.ok(slot.querySelector("[data-ingame-ally-badge]"), "동료 표시")
    const [band] = bandsIn(slot)
    assert.equal(band.textContent, NAMES[3])
    assert.match(band.className, /\bmax-w-full\b/)
    assert.match(band.className, /\btruncate\b/)
})
