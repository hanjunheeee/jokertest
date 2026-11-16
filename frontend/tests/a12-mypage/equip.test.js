// 마이페이지 스킨&카드 착용 창 시험: 안 산 카드 테두리는 못 고름·착용 버전 충돌이면 다시 불러오기 안내
// 목록 A12-상점-결제.md A12-F-145~146 ([지금 동작], 결정 대기 표에 "끼우기는 가진 것만" 문서 없음으로 올라 있음)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("../a12-store/storeKit.mjs")
const { default: SkinCardWearOverlay } = await import("../../src/domains/user/components/skinCardWear/SkinCardWearOverlay.jsx")
const { getSkinItemsForJob, getPlayerCardItems, SKIN_CARD_WEAR_JOB_TABS } = await import("../../src/domains/user/constants/skinCardWear/skinCardWearCatalog.js")

test.afterEach(() => kit.reset())

const EQUIP = "/economy/equip"

// 착용 창을 연 채로 그림 (가진 것은 entitlements)
async function wearOverlay({ entitlements = [], equip } = {}) {
  const s = kit.start({ gold: 0, entitlements })
  if (equip) s.on("POST", EQUIP, equip)
  kit.rtl.render(kit.h(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await kit.flush()
  return s
}
// 목록 칸 단추 (이름표에 "&"가 든 칸은 jsdom 선택자가 못 찾아서 속성 값을 직접 비교)
const byLabel = (selector, label, root = document) => [...root.querySelectorAll(selector)].find((el) => el.getAttribute("aria-label") === label) ?? null
const listButton = (label) => {
  const list = byLabel("aside", "스킨&카드 목록")
  return list ? byLabel("button", label, list) : null
}

test("A12-F-145 [지금 동작] 스킨&카드 착용 → 안 산 카드 테두리는 고를 수 없음", async () => {
  const cards = getPlayerCardItems()
  const unowned = cards.find((item) => item.id !== "player-card-베이스")
  const s = await wearOverlay({ entitlements: [] })
  await kit.click(document.querySelector('button[aria-label="플레이어 카드 미리보기로 전환"]'))
  const button = listButton(`${unowned.name}, 미보유`)
  assert.ok(button !== null, "미보유 카드 칸 없음")
  assert.equal(button.disabled, true)
  await kit.click(button)
  assert.equal(listButton(`${unowned.name}, 미보유`).getAttribute("aria-pressed"), "false")
  // 적용 눌러도 장착 요청 없음
  await kit.click(kit.buttonNamed("적용"))
  assert.equal(s.callsOf("POST", EQUIP).length, 0)
})

test("A12-F-146 [지금 동작] 착용 충돌(409 SKIN_REVISION_CONFLICT) → 다시 불러오기 안내", async () => {
  const firstJob = SKIN_CARD_WEAR_JOB_TABS[0].id
  const basic = getSkinItemsForJob(firstJob).filter((item) => item.source === "basic")
  // 기본 스킨 둘째 것으로 바꿔 적용 (기본은 늘 가진 것)
  const target = basic[1]
  const s = await wearOverlay({
    equip: kit.reply(409, {
      success: false, code: "SKIN_REVISION_CONFLICT",
      message: "장착 상태가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.",
    }),
  })
  await kit.click(listButton(target.name))
  await kit.click(kit.buttonNamed("적용"))
  assert.equal(s.callsOf("POST", EQUIP).length, 1)
  const alert = document.querySelector('[role="alert"]')
  assert.ok(alert !== null)
  assert.match(alert.textContent, /다시 불러/)
})
