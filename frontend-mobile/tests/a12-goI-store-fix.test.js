// 모바일 상점 고치기 시험: 실패 뒤 다른 상품을 고르면 판 위 안내가 사라지고 같은 상품이면 남음, 성공 번호여도 답 모양이 틀리면 결과 모름
// 목록 A12 모바일 A12-M-014~016, 합친 화면(2026-11-24 되돌림: 안내는 판 위)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a12-goI-store-fix.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, textOf } from "./a00-kit.mjs"
import { resetGame, serveMatch, useAuthStore } from "./a00-game.mjs"
import * as S from "./a00-store.mjs"

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    act(() => { useAuthStore.getState().logout() })
    try { window.localStorage.clear() } catch { /* 막힌 저장소 무시 */ }
    window.history.replaceState(null, "", "/")
})

const BULK = /^\/economy\/purchases\/bulk$/
const REJECTED = "구매가 거부되었습니다. 재화는 차감되지 않았습니다."
const ALREADY = "이미 보유한 상품입니다."
const NEED_CHECK = "구매 결과 확인이 필요합니다."

// 골드 넉넉한 계정이 스킨(처음 고른 상품) 앞에 선 모바일 상점, 구매 답은 answer
async function skinStore(answer) {
    S.startStore({ gold: 5000 })
    serveMatch("POST", BULK, answer)
    view = await S.openStore()
    assert.ok(S.detail(), "고른 상품 설명 칸이 없음")
}

test("A12-M-014 [버그 2] 모바일: 실패 뒤 다른 상품 고름 → 판 위 구매 결과 안내 사라짐 (앞 상품의 실패 글·다시 시도 안 남음)", async () => {
    await skinStore(S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }))
    await S.pressBuy()
    assert.ok(textOf(S.purchaseNotice()).includes(REJECTED), `판 위: ${S.topText()}`)
    await S.pickItem("경비원-푸른서리")
    assert.equal(S.detailName(), "경비원-푸른서리")
    assert.ok(S.purchaseNotice() === null, `판 위: ${S.topText()}`)
    assert.equal(S.belowText(), "")
    assert.equal(S.countText(ALREADY), 0)
    assert.ok(buttonNamed("다시 시도") === null, "다시 시도 단추가 남음")
})

test("A12-M-015 모바일: 실패 뒤 같은 상품을 다시 누름 → 판 위 실패 글·'다시 시도' 그대로", async () => {
    await skinStore(S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }))
    await S.pressBuy()
    const name = S.detailName()
    await S.pickItem(name)
    assert.equal(S.detailName(), name)
    assert.ok(textOf(S.purchaseNotice()).includes(REJECTED), `판 위: ${S.topText()}`)
    assert.ok(buttonNamed("다시 시도", S.purchaseNotice()) !== null, "다시 시도 단추가 없음")
})

test("A12-M-016 모바일: 구매 답 200인데 약속에 없는 모양 → 판 위 '구매 결과 확인이 필요합니다.'(완료 아님), 단추 \"보유중\" 아님", async () => {
    await skinStore(S.reply(200, { unexpected: true }))
    await S.pressBuy()
    const top = S.topText()
    assert.ok(top.includes(NEED_CHECK), `판 위: ${top}`)
    assert.ok(!top.includes("구매가 완료되었습니다."), `판 위: ${top}`)
    assert.notEqual(S.buyButton().textContent.trim(), "보유중")
})
