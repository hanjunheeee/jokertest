import assert from "node:assert/strict"
import test from "node:test"
import { LOBBY_MENU_ITEMS, LOBBY_MENU_ROUTES } from "../lobbyMenu.js"

function findMenuItem(id) {
  return LOBBY_MENU_ITEMS.find((item) => item.id === id)
}

test("로비 메뉴에 게임 플레이·상점·도서관·설정 항목이 모두 있다", () => {
  const expectedLabels = {
    gameplay: "게임플레이",
    store: "상점",
    archive: "기억의 서고",
    settings: "설정",
  }

  for (const [id, label] of Object.entries(expectedLabels)) {
    const item = findMenuItem(id)

    assert.ok(item, `로비 메뉴에 ${id} 항목이 없습니다.`)
    assert.equal(item.label, label)

    assert.equal(typeof item.src, "string")
    assert.ok(item.src.length > 0, `${id} 메뉴 버튼 이미지 경로가 비어 있습니다.`)
  }
})

test("F-18 AC-05: 명예의 전당 메뉴 항목이 로비 메뉴 목록에 남아 있지 않다", () => {
  assert.equal(findMenuItem("hallOfFame"), undefined, "hallOfFame 메뉴 항목이 아직 남아 있습니다.")
  assert.equal(
    LOBBY_MENU_ITEMS.some((item) => item.label === "명예의 전당"),
    false,
    "'명예의 전당' 라벨을 가진 메뉴가 아직 남아 있습니다.",
  )
})

test("도서관 메뉴가 /library 경로로 이동하고, 명예의 전당(/podium) 이동은 더 이상 없다", () => {
  assert.equal(LOBBY_MENU_ROUTES.archive, "/library")

  assert.equal(
    Object.hasOwn(LOBBY_MENU_ROUTES, "hallOfFame"),
    false,
    "hallOfFame 이동 경로가 아직 남아 있습니다.",
  )
  assert.equal(
    Object.values(LOBBY_MENU_ROUTES).includes("/podium"),
    false,
    "어떤 메뉴도 /podium으로 이동하면 안 됩니다.",
  )
})

test("이동 경로가 있는 메뉴 id는 모두 메뉴 목록에 존재한다", () => {
  const menuIds = new Set(LOBBY_MENU_ITEMS.map((item) => item.id))

  for (const id of Object.keys(LOBBY_MENU_ROUTES)) {
    assert.ok(menuIds.has(id), `경로만 있고 메뉴 항목이 없는 id입니다: ${id}`)
  }
})

test("F-18 AC-02: 고객센터 항목은 정확히 하나이며 메뉴 목록의 마지막에 있다", () => {
  const customerSupportItems = LOBBY_MENU_ITEMS.filter((item) => item.id === "customerSupport")

  assert.equal(customerSupportItems.length, 1, "고객센터 메뉴가 중복되었습니다(별도 버튼 추가 금지).")
  assert.equal(customerSupportItems[0].label, "고객센터")
  assert.equal(typeof customerSupportItems[0].src, "string")
  assert.ok(customerSupportItems[0].src.length > 0)
  assert.equal(
    LOBBY_MENU_ITEMS[LOBBY_MENU_ITEMS.length - 1].id,
    "customerSupport",
    "고객센터는 메뉴 목록 맨 아래에 있어야 합니다.",
  )
})

test("F-18 AC-03: 고객센터는 앱 내부 이동 경로를 갖지 않는다(외부 Discord 지원 링크)", () => {
  assert.equal(Object.hasOwn(LOBBY_MENU_ROUTES, "customerSupport"), false)
})
