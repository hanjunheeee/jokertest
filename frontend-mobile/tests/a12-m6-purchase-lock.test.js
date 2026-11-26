// 모바일 상점 구매 단추 잠금 시험: 가진 상품은 '보유중' 꺼짐, 골드 부족(단건·일괄)은 미리 꺼지고 단추 아래 사유 표시, 답 기다리는 동안 꺼짐
// 목록 A12 모바일 A12-M-601~603 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a12-m6-purchase-lock.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush, textOf } from "./a00-kit.mjs"
import { resetGame, sentHttp, serveMatch, useAuthStore } from "./a00-game.mjs"
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

// 프로필 테두리 분류 첫 상품 "남작"(200골드) 앞
async function borderStore(options) {
    S.startStore(options)
    view = await S.openStore()
    await S.pickCategory("프로필 테두리")
    assert.equal(S.detailName(), "남작", "준비: 남작이 안 골라짐")
}

test("A12-M-601 이미 가진 테두리 '남작' → 구매 단추 '보유중'·꺼짐, 까닭 줄 없음", async () => {
    await borderStore({ gold: 1000, entitlements: ["profile-border-남작"] })
    assert.equal(textOf(S.buyButton()), "보유중")
    assert.equal(S.buyButton().disabled, true)
    assert.equal(S.reasonEl(), null)
})

test("A12-M-602 골드 부족(단건 0골드·일괄구매 700골드에 1000골드 합) → 단추 미리 꺼짐 + 단추 아래 '잔액이 부족합니다.'", async () => {
    await borderStore({ gold: 0 })
    assert.equal(S.buyButton().disabled, true)
    assert.equal(textOf(S.reasonEl()), "잔액이 부족합니다.")

    resetGame(view)
    view = null
    S.startStore({ gold: 700 })
    view = await S.openStore()
    await S.pickCategory("스킨")
    assert.equal(S.buyButton().disabled, false)
    click(buttonNamed("일괄구매"))
    await flush(4)
    await S.pickItem("귀족-로코코")
    assert.equal(S.buyButton().disabled, true)
    assert.equal(textOf(S.reasonEl()), "잔액이 부족합니다.")
})

test("A12-M-603 구매를 누르고 답을 기다리는 동안 → 단추 꺼짐 + 단추 아래 '구매 결과를 확인하고 있습니다…', 거절 답 오면 다시 켜짐", async () => {
    const answer = S.later()
    S.startStore({ gold: 5000 })
    serveMatch("POST", BULK, () => answer.promise)
    view = await S.openStore()
    await S.pressBuy()
    assert.equal(sentHttp("POST", "/economy/purchases/bulk").length, 1)
    assert.equal(S.buyButton().disabled, true, "답을 기다리는데 단추가 켜짐")
    assert.ok(S.belowText().includes("구매 결과를 확인하고 있습니다"), `단추 아래: ${S.belowText()}`)
    await act(async () => { answer.give(S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." })) })
    await flush(10)
    assert.ok(S.belowText().includes("구매가 거부되었습니다."), `단추 아래: ${S.belowText()}`)
    assert.equal(S.buyButton().disabled, false, "거절 뒤에도 단추가 꺼져 있음")
})
