// 관리자 쿠폰 화면 시험: 쓸 수 있는 횟수 없음(null)이면 제한 없다는 글 + 쓴 사람 수
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-099, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-coupons.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, cleanup, openAt, createFakeServer } from "./a14-kit.mjs"

const { default: CouponsPage } = await import("../../src/admin/domains/coupons/pages/CouponsPage.jsx")

test.afterEach(() => cleanup())

test("A14-F-099 쿠폰 횟수 없음: maxUses:null 줄 → \"무제한\" 비슷한 글, 쓴 사람 수(3) 보임", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/coupons", 200, {
    ok: true,
    items: [
      { id: 1, code: "A14FREE", rewardType: "GOLD", rewardAmount: 100, maxUses: null, usedCount: 3, startsAt: null, endsAt: null, isActive: true, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: 2, code: "A14TEN", rewardType: "GOLD", rewardAmount: 50, maxUses: 10, usedCount: 4, startsAt: null, endsAt: null, isActive: true, createdAt: "2026-11-01T00:00:00.000Z" },
    ],
    nextBefore: null,
  })
  await openAt("/coupons", h(CouponsPage))
  // "쓴 수" 칸 차례 찾기 → 그 칸 글
  const heads = [...document.querySelectorAll("thead th")].map((th) => th.textContent)
  const col = heads.indexOf("쓴 수")
  assert.ok(col >= 0, "쓴 수 칸이 없음")
  const usedOf = (code) => [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(code))?.querySelectorAll("td")[col]?.textContent ?? ""
  const unlimited = usedOf("A14FREE")
  assert.match(unlimited, /무제한|제한 없음/)
  assert.match(unlimited, /\b3\b/)
  // 횟수 있는 쿠폰엔 제한 없다는 글이 없음
  assert.doesNotMatch(usedOf("A14TEN"), /무제한|제한 없음/)
})
