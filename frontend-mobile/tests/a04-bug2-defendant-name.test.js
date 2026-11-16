// 모바일 재판 피고 카드 이름 시험: 가입 최대 8자 닉네임도 줄임표 없이 이름판 안에 다 들어가는 글자 크기 (셈), 짧은 이름은 판 카드와 같은 크기, 판 위 카드는 그대로 줄임표
// 목록 A04 모바일 A04-M-019~021 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-bug2-defendant-name.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const { INGAME_PLAYER_NAMEPLATE_INSET } = await import("@/domains/game/ingame/constants/board/ingamePlayerAssets.js")
const { default: DefendantCard } = await import("@m/domains/game/ingame/components/overlays/tribunal/DefendantCard.jsx")
const { default: PlayerCard } = await import("@m/domains/game/ingame/components/board/PlayerCard.jsx")

const h = React.createElement
let drawn = null
afterEach(() => { drawn?.unmount(); drawn = null })

// 피고 카드 그리기 → 이름판 칸(p), 맞춘 글자 크기는 칸 값 --nameplate-fit-size (예: "clamp(0.5rem, 8.54cqi, 1.05rem)")
const plateOf = (nickname) => {
    drawn = render(h(DefendantCard, { defendant: { id: "p3", nickname, portraitSrc: null, status: "ALIVE", theme: null } }))
    return drawn.container.querySelector("[data-ingame-nameplate-band]").parentElement
}
// "clamp(0.5rem, 8.54cqi, 1.05rem)" → 8.54
const fitSizeOf = (plate) => plate.style.getPropertyValue("--nameplate-fit-size")
const cqiOf = (plate) => Number(fitSizeOf(plate).match(/([\d.]+)cqi/)?.[1] ?? NaN)
// 이름판 안 글이 들어갈 폭 (카드 폭 %): 이름판 칸 폭(옆 inset 뺌)에서 칸 옆 여백 1%×2 뺌
const PLATE_INNER = 100 - parseFloat(INGAME_PLAYER_NAMEPLATE_INSET.left) - parseFloat(INGAME_PLAYER_NAMEPLATE_INSET.right) - 2
// 띠 포함 이름 폭 (카드 폭 %): 한글 한 자 1em + 자간 0.025em, 띠 옆 여백 0.35em×2
const nameWidth = (nickname, cqi) => (Array.from(nickname).length * 1.025 + 0.7) * cqi

test("A04-M-019 피고 카드 한글 8자 닉네임 → 이름 글자 크기가 띠 포함 이름판 폭 안에 다 들어감 (줄임표 안 생김)", () => {
    const nickname = "맘모사바하가나다"
    const plate = plateOf(nickname)
    const cqi = cqiOf(plate)
    assert.ok(Number.isFinite(cqi), `글자 크기가 카드 폭 기준이 아님: "${fitSizeOf(plate)}"`)
    assert.ok(nameWidth(nickname, cqi) <= PLATE_INNER, `이름 폭 ${nameWidth(nickname, cqi).toFixed(1)}% > 이름판 ${PLATE_INNER}%`)
    assert.equal(plate.querySelector("[data-ingame-nameplate-band]").textContent, nickname)
})

test("A04-M-020 피고 카드 2자 닉네임 → 판 카드와 같은 11cqi (짧은 이름은 안 줄임)", () => {
    assert.equal(cqiOf(plateOf("민수")), 11)
})

test("A04-M-021 판 위 카드(PlayerCard) → 글자 맞춤 없음, 띠는 줄임표 칸 그대로", () => {
    drawn = render(h(PlayerCard, { nickname: "맘모사바하가나다", portraitSrc: null }))
    const band = drawn.container.querySelector("[data-ingame-nameplate-band]")
    assert.equal(band.parentElement.hasAttribute("data-nameplate-fit"), false)
    assert.equal(band.parentElement.style.getPropertyValue("--nameplate-fit-size"), "")
    assert.match(band.className, /\btruncate\b/)
})
