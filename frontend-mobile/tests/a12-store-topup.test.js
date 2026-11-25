// 모바일 충전 복귀·내역 시험: 토스 실패 까닭(카드 거절) 글, 내역의 판 보상 줄
// 목록 A12 모바일 A12-M-008·013 (돌리기: frontend-mobile 폴더에서 node --test tests/a12-store-topup.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { pageText, textOf } from "./a00-kit.mjs"
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

const CONFIRM = /^\/economy\/topup\/orders\/[^/]+\/confirm$/
const CARD = "카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다."

test("A12-M-008 토스 실패 까닭: ?topup=fail&code=REJECT_CARD_COMPANY → 카드 거절 글", async () => {
    S.startStore({ gold: 0, diamond: 0, products: [S.DIA_PRODUCT] })
    serveMatch("POST", CONFIRM, S.reply(200, { ok: true, status: "GRANTED", balanceDiamond: 110 }))
    view = await S.openStore({ search: "?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_m1_0001" })
    assert.ok(pageText().includes(CARD), `화면 글: ${pageText().slice(0, 300)}`)
})

test("A12-M-013 내역 판 보상 줄: CurrencyHistory에 GAME_REWARD +1 → '판 보상'·'+1'", async () => {
    const tx = { id: 1, reason: "GAME_REWARD", itemId: null, currency: "GOLD", amount: 1, balanceAfter: 101, referenceEventId: "m1-ref-1", createdAt: "2026-11-16T03:00:00.000Z" }
    S.startStore({ gold: 100, diamond: 10, products: [S.DIA_PRODUCT], transactions: [tx] })
    view = await S.openStore()
    await S.pickCategory("인게임 재화")
    const rows = [...document.querySelectorAll('[data-testid="currency-transaction"]')].map(textOf)
    assert.equal(rows.length, 1, `내역 줄: ${JSON.stringify(rows)}`)
    assert.ok(rows[0].includes("판 보상"), rows[0])
    assert.ok(rows[0].includes("+1"), rows[0])
})
