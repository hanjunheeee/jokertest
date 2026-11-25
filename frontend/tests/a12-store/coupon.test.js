// 상점 쿠폰 입력 창 시험: 됨이면 보상 글 + 지갑 다시 받음, 안 되면 서버 글 그대로 (이미 씀·기간 끝·시작 전·다 씀·형식·요청 너무 많음)
// 목록 A12-상점-결제.md A12-F-128~134·177·178 (docs/회원기능_2026-11-09.md 32줄, 운영받침 쿠폰 오류 코드)
// 상점 "쿠폰 입력" 단추는 기본 숨김, 빌드 값 VITE_STORE_COUPON_BUTTON=1 이면 보임 (PC·모바일 같은 값) → 쿠폰 창은 단추 부품을 보이게 직접 그려서 봄
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")
const { default: StoreCouponButton } = await import("../../src/domains/store/components/StoreCouponButton.jsx")
const { STORE_SHOW_COUPON_BUTTON, isStoreCouponButtonShown } = await import("../../src/domains/store/constants/storeLayoutStyle.js")

test.afterEach(() => kit.reset())

const REDEEM = "/economy/coupons/redeem"

// 쿠폰 단추 부품만 보이게 그림 (상점 화면 전체를 안 그려도 되게)
async function renderCouponButton() {
  kit.rtl.render(kit.h(kit.MemoryRouter, { initialEntries: ["/store"] }, kit.h(StoreCouponButton, { visible: true })))
  await kit.flush()
}

// 쿠폰 창을 열고 코드를 넣어 "사용하기"
async function redeem(answer, code = "A12-WELCOME") {
  const s = kit.start({ gold: 1000 })
  s.on("POST", REDEEM, answer)
  await renderCouponButton()
  await kit.click(kit.buttonNamed("쿠폰 입력"))
  const input = document.querySelector('input[aria-label="쿠폰 코드"]')
  assert.ok(input !== null)
  await kit.rtl.act(async () => { kit.rtl.fireEvent.change(input, { target: { value: code } }) })
  await kit.click(kit.buttonNamed("사용하기"))
  return s
}
// 창 안 결과 글 (실패면 alert, 됨이면 status)
const resultText = (role) => [...document.querySelectorAll(`[role="${role}"]`)].map((el) => el.textContent).join("|")

test("A12-F-128 쿠폰 됨 → 보상 글 + 지갑 다시 받음", async () => {
  const s = kit.start({ gold: 1000 })
  s.on("POST", REDEEM, kit.reply(201, { ok: true, redemptionId: 7, code: "A12-WELCOME", reward: { currency: "GOLD", amount: 100 }, balanceAfter: 1100 }))
  await renderCouponButton()
  const walletBefore = s.callsOf("GET", /\/wallet$/).length
  await kit.click(kit.buttonNamed("쿠폰 입력"))
  const input = document.querySelector('input[aria-label="쿠폰 코드"]')
  await kit.rtl.act(async () => { kit.rtl.fireEvent.change(input, { target: { value: "A12-WELCOME" } }) })
  await kit.click(kit.buttonNamed("사용하기"))
  assert.equal(s.callsOf("POST", REDEEM).length, 1)
  assert.deepEqual(s.callsOf("POST", REDEEM)[0].body, { code: "A12-WELCOME" })
  assert.ok(resultText("status").includes("골드 100개를 받았습니다."), resultText("status"))
  assert.ok(s.callsOf("GET", /\/wallet$/).length > walletBefore)
})

const FAILS = [
  ["A12-F-129", 409, "COUPON_ALREADY_REDEEMED", "이미 사용한 쿠폰입니다."],
  ["A12-F-130", 409, "COUPON_EXPIRED", "기간이 끝난 쿠폰입니다."],
  ["A12-F-131", 409, "COUPON_NOT_STARTED", "아직 사용할 수 없는 쿠폰입니다."],
  ["A12-F-132", 409, "COUPON_EXHAUSTED", "모두 사용된 쿠폰입니다."],
  ["A12-F-133", 400, "INVALID_COUPON_CODE", "쿠폰 코드 형식이 올바르지 않습니다."],
]
for (const [id, status, code, message] of FAILS) {
  test(`${id} 쿠폰 ${code}(${status}) → 서버 글 "${message}" 보임`, async () => {
    // 일반 경로 오류 몸 모양 (errorHandler 기본)
    const s = await redeem(kit.reply(status, { success: false, message, code }))
    assert.equal(s.callsOf("POST", REDEEM).length, 1)
    assert.equal(resultText("alert"), message)
  })
}

test("A12-F-134 요청 너무 많음(429) → 서버 글 \"쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요.\" 보임", async () => {
  const message = "쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요."
  const s = await redeem(kit.reply(429, { ok: false, code: "RATE_LIMITED", message }))
  assert.equal(s.callsOf("POST", REDEEM).length, 1)
  assert.equal(resultText("alert"), message)
})

// 쿠폰 단추는 기본 숨김 (빌드 값 VITE_STORE_COUPON_BUTTON 없음 — node 시험엔 import.meta.env가 없음)
test("A12-F-177 상점 화면(입장 영상 뒤), 빌드 값 없음 → \"쿠폰 입력\" 단추 안 보임 (기본 숨김)", async () => {
  assert.equal(STORE_SHOW_COUPON_BUTTON, false)
  kit.start({ gold: 1000 })
  await kit.renderStorePage()
  assert.ok(document.querySelector('[aria-label="보유 재화"]') !== null, "상점 화면이 안 그려짐 (준비 잘못)")
  assert.equal(kit.buttonNamed("쿠폰 입력"), null)
})

// 켜는 값: VITE_STORE_COUPON_BUTTON=1 일 때만 보임 (켠 단추가 쿠폰 창을 여는 것은 위 A12-F-128~134가 봄)
test("A12-F-178 쿠폰 단추 빌드 값 → \"1\"이면 보임, 없음·\"0\"·\"true\"면 숨김", () => {
  assert.equal(isStoreCouponButtonShown({ VITE_STORE_COUPON_BUTTON: "1" }), true)
  assert.equal(isStoreCouponButtonShown({}), false)
  assert.equal(isStoreCouponButtonShown(undefined), false)
  assert.equal(isStoreCouponButtonShown({ VITE_STORE_COUPON_BUTTON: "0" }), false)
  assert.equal(isStoreCouponButtonShown({ VITE_STORE_COUPON_BUTTON: "true" }), false)
})
