// 재화 상품 화면 판단 시험 (목록 합치기·버튼 글자·잠금·충전/골드 안내·결제 복귀 주소 검사·상품 칸 그림)
// 화면 없이 순수 함수만 봄
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const {
  CURRENCY_CATEGORY, currencyPurchaseLabel, goldFeedbackOf, isCurrencyBlocked, mergeCurrencyItems, topupFeedbackOf,
} = await import("../../../../src/domains/store/utils/currencyView.js")
const { parseReturn, parseProduct, toCurrencyStoreItem } = await import("../../../../src/domains/store/utils/currencyParse.js")

const ready = { productsStatus: "ready", productsStale: false, configPending: false, status: "idle", reason: null, autoChecks: 0, lookupFailed: false, products: [] }
const skin = { id: "skin-a", category: "스킨" }
const placeholder = { id: "ingame-money-gold-50", category: CURRENCY_CATEGORY }
const diamond = { id: "currency:dia-10", category: CURRENCY_CATEGORY, kind: "DIAMOND_TOPUP" }

test("목록 합치기: 재화 분류는 서버 상품만, 전체는 정적(자리표시 뺌)+서버, 다른 분류는 정적만", () => {
  assert.deepEqual(mergeCurrencyItems(CURRENCY_CATEGORY, [placeholder], [diamond]), [diamond])
  assert.deepEqual(mergeCurrencyItems(null, [skin, placeholder], [diamond]), [skin, diamond])
  assert.deepEqual(mergeCurrencyItems("스킨", [skin], [diamond]), [skin])
})

test("잠금: 목록 준비 안 됨·바뀐 상품·설정 대기는 둘 다, 충전 진행 중은 충전만 막음", () => {
  assert.equal(isCurrencyBlocked(ready, "DIAMOND_TOPUP"), false)
  assert.equal(isCurrencyBlocked({ ...ready, productsStatus: "loading" }, "GOLD_PURCHASE"), true)
  assert.equal(isCurrencyBlocked({ ...ready, productsStale: true }, "DIAMOND_TOPUP"), true)
  assert.equal(isCurrencyBlocked({ ...ready, configPending: true }, "DIAMOND_TOPUP"), true)
  assert.equal(isCurrencyBlocked({ ...ready, status: "confirming" }, "DIAMOND_TOPUP"), true)
  assert.equal(isCurrencyBlocked({ ...ready, status: "confirming" }, "GOLD_PURCHASE"), false)
  assert.equal(isCurrencyBlocked({ ...ready, status: "done" }, "DIAMOND_TOPUP"), false)
})

test("버튼 글자: 충전은 설정 대기·진행 단계, 골드는 처리 중·가격 재확인, 재화 아니면 null", () => {
  const idleGold = { kind: null, status: "idle" }
  const label = (kind, currency, purchaseState = idleGold) => currencyPurchaseLabel({ kind, currency, purchaseState })
  assert.equal(label("DIAMOND_TOPUP", ready), "충전")
  assert.equal(label("DIAMOND_TOPUP", { ...ready, configPending: true }), "설정 대기")
  assert.equal(label("DIAMOND_TOPUP", { ...ready, status: "payment" }), "결제창 이동 중")
  assert.equal(label("DIAMOND_TOPUP", { ...ready, status: "pendingGrant" }), "지급 대기")
  assert.equal(label("GOLD_PURCHASE", ready), "골드 구매")
  assert.equal(label("GOLD_PURCHASE", ready, { kind: "GOLD", status: "pending" }), "처리 중")
  assert.equal(label("GOLD_PURCHASE", ready, { kind: "GOLD", status: "priceChanged" }), "가격 재확인 필요")
  assert.equal(label(null, ready), null)
})

test("충전 안내: 빈 상태는 없음, 실패는 이유별 문구, 모르는 이유는 기본 문구, 결과 모름엔 확인 버튼·덧붙임", () => {
  assert.equal(topupFeedbackOf(ready), null)
  assert.match(topupFeedbackOf({ ...ready, status: "failed", reason: "AMOUNT_MISMATCH" }).message, /금액이 주문과 달라/)
  assert.match(topupFeedbackOf({ ...ready, status: "failed", reason: "WHAT" }).message, /충전에 실패했습니다/)
  assert.match(topupFeedbackOf({ ...ready, configPending: true }).message, /설정 대기/)
  assert.equal(topupFeedbackOf({ ...ready, status: "done" }).canCheck, false)
  const unknown = topupFeedbackOf({ ...ready, status: "unknown", lookupFailed: true, autoChecks: 5 })
  assert.equal(unknown.canCheck, true)
  assert.equal(unknown.notes.length, 2)
  assert.deepEqual(topupFeedbackOf({ ...ready, status: "pendingGrant" }).notes, [])
})

test("골드 안내: 골드 기록 아니면 없음, 다이아 부족은 충전 이동, 가격 바뀜은 새 조건, 결과 모름은 확인·다시 시도", () => {
  assert.equal(goldFeedbackOf({ kind: null, status: "confirmed" }), null)
  assert.equal(goldFeedbackOf({ kind: "GOLD", status: "idle", error: null }), null)
  const poor = goldFeedbackOf({ kind: "GOLD", status: "rejected", code: "INSUFFICIENT_DIAMOND", error: "다이아 부족" })
  assert.equal(poor.canGoTopup, true)
  assert.equal(poor.detail, null)
  const changed = goldFeedbackOf({ kind: "GOLD", status: "priceChanged" }, { payAmount: 12, grantAmount: 100, bonusAmount: 5 })
  assert.equal(changed.detail, "새 조건: 12 다이아 → 골드 100 + 보너스 5")
  assert.equal(changed.canAcceptPrice, true)
  assert.match(goldFeedbackOf({ kind: "GOLD", status: "priceChanged" }, null).detail, /판매 중이 아니거나/)
  const unknown = goldFeedbackOf({ kind: "GOLD", status: "unknown", error: "확인 못 함" })
  assert.deepEqual([unknown.canCheck, unknown.canRetry, unknown.detail], [true, true, "확인 못 함"])
})

test("결제 복귀 주소: 토스가 붙인 paymentKey·orderId·amount 모양이 맞아야 valid, 실패 복귀는 주문 id만", () => {
  const ok = parseReturn("?topup=success&paymentKey=tgen_20261109abc&orderId=7b0e7f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b&amount=1100")
  assert.deepEqual(ok, { mode: "success", valid: true, paymentKey: "tgen_20261109abc", orderId: "7b0e7f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", amount: 1100 })
  assert.equal(parseReturn("?topup=success&paymentKey=k&orderId=short&amount=1100").valid, false)
  assert.equal(parseReturn("?topup=success&paymentKey=k&orderId=7b0e7f9e-1c2d&amount=01100").valid, false)
  assert.deepEqual(parseReturn("?topup=fail&code=PAY_PROCESS_CANCELED&message=x"), { mode: "fail", orderId: null })
  assert.equal(parseReturn("?foo=1"), null)
})

test("상품 칸: 수량 맞는 묶음 그림을 쓰고, 없으면 재화 표시 그림", () => {
  const product = parseProduct({
    productId: "dia-50", kind: "DIAMOND_TOPUP", displayName: "다이아 50개", payCurrency: "KRW", payAmount: 5500,
    grantCurrency: "DIAMOND", grantAmount: 50, bonusAmount: 0, version: 1,
  })
  assert.match(toCurrencyStoreItem(product).icon.normalize("NFC"), /다이아-50\.png$/)
  assert.equal(toCurrencyStoreItem({ ...product, grantAmount: 77 }).icon.normalize("NFC"), "/button/재화 표시(다이아).png")
  assert.equal(toCurrencyStoreItem(product).id, "currency:dia-50")
  assert.equal(parseProduct({ ...product, payCurrency: "DIAMOND" }), null)
})
