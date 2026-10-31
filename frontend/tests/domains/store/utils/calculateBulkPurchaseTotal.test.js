import test from "node:test"
import assert from "node:assert/strict"
import { calculateBulkPurchaseTotal } from "../../../../src/domains/store/utils/calculateBulkPurchaseTotal.js"
import { STORE_PRICE_PENDING } from "../../../../src/domains/store/constants/storeItems.js"

test("가격이 있는 상품들의 합계를 반환한다", () => {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal([
    { priceAmount: "200" },
    { priceAmount: "300" },
    { priceAmount: "500" },
  ])

  assert.equal(total, 1000)
  assert.equal(hasPendingPrice, false)
})

test("준비중 상품이 섞여 있으면 합계에서 제외하고 hasPendingPrice를 true로 반환한다", () => {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal([
    { priceAmount: "200" },
    { priceAmount: STORE_PRICE_PENDING },
    { priceAmount: "300" },
  ])

  assert.equal(total, 500)
  assert.equal(hasPendingPrice, true)
})

test("빈 목록이면 합계 0과 hasPendingPrice false를 반환한다", () => {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal([])

  assert.equal(total, 0)
  assert.equal(hasPendingPrice, false)
})

test("모든 상품이 준비중이면 합계는 0이고 hasPendingPrice는 true다", () => {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal([
    { priceAmount: STORE_PRICE_PENDING },
    { priceAmount: STORE_PRICE_PENDING },
  ])

  assert.equal(total, 0)
  assert.equal(hasPendingPrice, true)
})
