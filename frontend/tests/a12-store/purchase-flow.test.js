// 아이템 구매 흐름 시험: 보내기 전 기록 남기기·두 번 눌러도 한 번·결과 확인·결과 모름 동안 잠김·새로고침·계정 바뀜·모양 틀린 답
// 목록 A12-상점-결제.md A12-F-036~043 (옛 설계 F-32 2-5·2-5a·2-6)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const NEED_CHECK = "구매 결과 확인이 필요합니다."
const BULK = "/economy/purchases/bulk"
const LOOKUP = /^\/economy\/purchases\/[^/]+$/
const DONE = kit.reply(201, { idempotent: false, kind: "ITEM", results: [] })
const SERVER_500 = kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." })

// 기기 저장소에 남은 글 전부 (어느 칸에 있든)
function storedTexts() {
  const out = []
  for (let i = 0; i < window.localStorage.length; i += 1) out.push(window.localStorage.getItem(window.localStorage.key(i)))
  return out
}

// 골드 넉넉한 계정이 스킨 앞에 섬
async function skinStore(answer) {
  const s = kit.start({ gold: 5000 })
  if (answer) s.on("POST", BULK, answer)
  await kit.renderStore()
  return s
}

test("A12-F-036 구매 누름 → 기기 저장소에 참조 번호 기록이 생긴 뒤, 요청 몸에 같은 번호", async () => {
  let storedAtSend = null
  const s = await skinStore(({ body }) => {
    // 요청이 서버에 닿은 그때 저장소에 이 번호 기록이 있는지
    storedAtSend = storedTexts().some((text) => typeof text === "string" && text.includes(body.referenceEventId))
    return DONE
  })
  await kit.pressBuy()
  const sent = s.callsOf("POST", BULK)
  assert.equal(sent.length, 1)
  assert.equal(typeof sent[0].body.referenceEventId, "string")
  assert.ok(sent[0].body.referenceEventId.length > 0)
  assert.equal(storedAtSend, true)
})

test("A12-F-037 구매 단추를 두 번 빨리 누름 → 구매 요청 1번", async () => {
  const held = kit.later()
  const s = await skinStore(() => held.promise)
  const button = kit.buyButton()
  await kit.rtl.act(async () => {
    kit.rtl.fireEvent.click(button)
    kit.rtl.fireEvent.click(button)
  })
  await kit.flush()
  assert.equal(s.callsOf("POST", BULK).length, 1)
  held.give(DONE)
  await kit.flush()
  assert.equal(s.callsOf("POST", BULK).length, 1)
})

test("A12-F-038 결과 모름 → 결과 확인 → GET /purchases/:번호 있음 → 성공 처리·잔액 다시 받음", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(NEED_CHECK))
  const ref = s.callsOf("POST", BULK)[0].body.referenceEventId
  s.on("GET", LOOKUP, kit.reply(200, { kind: "ITEM", results: [], createdAt: "2026-11-16T00:00:00.000Z" }))
  const walletBefore = s.callsOf("GET", /\/wallet$/).length
  await kit.click(kit.buttonNamed("결과 확인", kit.belowButton()))
  const looked = s.callsOf("GET", LOOKUP)
  assert.ok(looked.length >= 1)
  assert.equal(looked.at(-1).path, `/economy/purchases/${encodeURIComponent(ref)}`)
  assert.ok(kit.belowText().includes("구매가 완료되었습니다."), kit.belowText())
  assert.ok(s.callsOf("GET", /\/wallet$/).length > walletBefore)
})

test("A12-F-039 [지금 동작] 결과 확인(GET /purchases/:번호)이 404 → 같은 번호로 다시 보냄 (다시 시도 누름)", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  const ref = s.callsOf("POST", BULK)[0].body.referenceEventId
  s.on("GET", LOOKUP, kit.reply(404, { success: false, code: "PURCHASE_RESULT_NOT_FOUND", message: "해당 참조 사건 ID로 커밋된 구매 결과가 없습니다." }))
  s.on("POST", BULK, DONE)
  await kit.click(kit.buttonNamed("다시 시도", kit.belowButton()))
  const posts = s.callsOf("POST", BULK)
  assert.equal(posts.length, 2)
  assert.equal(posts[1].body.referenceEventId, ref)
  // 묻기가 다시 보내기보다 먼저
  const order = s.calls.filter((c) => c.path.startsWith("/economy/purchases")).map((c) => `${c.method} ${c.path === BULK ? "bulk" : "lookup"}`)
  assert.deepEqual(order.slice(-2), ["GET lookup", "POST bulk"])
})

test("A12-F-040 결과 모름 동안 → 다른 상품 고르기·구매 잠김", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  const before = kit.detail().querySelector("h2").textContent
  await kit.pickItem("경비원-푸른서리")
  assert.equal(kit.detail().querySelector("h2").textContent, before)
  assert.equal(kit.buyButton().disabled, true)
  await kit.pressBuy()
  assert.equal(s.callsOf("POST", BULK).length, 1)
})

test("A12-F-041 결과 모름 기록이 남은 채 새로고침(다시 로그인·다시 그림) → 결과 확인 상태로 시작, 같은 번호로 물음", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  const ref = s.callsOf("POST", BULK)[0].body.referenceEventId
  s.on("GET", LOOKUP, SERVER_500)
  kit.rtl.cleanup()
  kit.signOut()
  kit.signIn(s.uuid)
  await kit.renderStore()
  assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
  assert.ok(kit.buttonNamed("결과 확인", kit.belowButton()) !== null)
  assert.ok(s.callsOf("GET", LOOKUP).some((c) => c.path === `/economy/purchases/${encodeURIComponent(ref)}`))
  assert.equal(s.callsOf("POST", BULK).length, 1)
})

test("A12-F-042 A 계정 결과 모름 기록 → B로 로그인 → B 화면에 A 안내 없음", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(NEED_CHECK))
  const aRef = s.callsOf("POST", BULK)[0].body.referenceEventId
  kit.rtl.cleanup()
  kit.signOut()
  kit.signIn(kit.nextUuid("a12-other"))
  await kit.renderStore()
  assert.equal(kit.belowText(), "")
  assert.equal(s.callsOf("GET", LOOKUP).filter((c) => c.path.endsWith(encodeURIComponent(aRef))).length, 0)
})

test("A12-F-043 200인데 계약에 없는 모양의 답 → 성공 아님(결과 모름), 단추 \"보유중\" 아님", async () => {
  await skinStore(kit.reply(200, { unexpected: true }))
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
  assert.notEqual(kit.buyLabel(), "보유중")
})
