// [버그 2] 모바일: 지급 대기 주문이 있는 사람이 실패 주소로 상점을 새로 열어도 카드 거절 안내가 지급 대기 안내에 안 덮이는지 보는 시험
// 목록 A12 모바일 A12-M-017 (고치기 고S, 2026-11-16, 돌리기: frontend-mobile 폴더에서 node --test tests/a12-goS-fail-return.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { pageText } from "./a00-kit.mjs"
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

const ORDER_ONE = /^\/economy\/topup\/orders\/[^/]+$/
const PENDING = "결제는 승인되었고 다이아 지급을 기다리고 있습니다."
const CARD = "카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다."

test("A12-M-017 [버그 2] 지급 대기 주문 + 실패 주소(REJECT_CARD_COMPANY)로 새로 엶 → 카드 거절 안내와 지급 대기 안내가 둘 다 보임", async () => {
    S.startStore({
        gold: 0, diamond: 0, products: [S.DIA_PRODUCT],
        openOrders: [{ orderId: "order_open_0001", status: "PENDING_GRANT", amount: 1100, orderName: "다이아 100", createdAt: "2026-11-16T00:00:00.000Z" }],
    })
    // 열린 주문 조회는 답을 안 줌 (지급 대기 그대로)
    serveMatch("GET", ORDER_ONE, () => S.later().promise)
    view = await S.openStore({ search: "?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_m1_0002" })
    const all = pageText()
    assert.ok(all.includes(PENDING), `지급 대기 안내가 없음: ${all.slice(0, 300)}`)
    assert.equal(S.countText(CARD), 1, `카드 거절 안내가 한 번 보여야 함: ${all.slice(0, 300)}`)
})
