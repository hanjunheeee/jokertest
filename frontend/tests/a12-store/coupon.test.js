// 상점 쿠폰 입력 창 시험: 됨이면 보상 글 + 지갑 다시 받음, 안 되면 서버 글 그대로 (이미 씀·기간 끝·시작 전·다 씀·형식·요청 너무 많음)
// 목록 A12-상점-결제.md A12-F-128~134 (docs/회원기능_2026-11-09.md 32줄, 운영받침 쿠폰 오류 코드)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const REDEEM = "/economy/coupons/redeem"

// 상점 화면에서 쿠폰 창을 열고 코드를 넣어 "사용하기"
async function redeem(answer, code = "A12-WELCOME") {
  const s = kit.start({ gold: 1000 })
  s.on("POST", REDEEM, answer)
  await kit.renderStorePage()
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
  await kit.renderStorePage()
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
