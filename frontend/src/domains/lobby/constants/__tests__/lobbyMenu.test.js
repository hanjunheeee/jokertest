import assert from "node:assert/strict"
import test from "node:test"
import { LOBBY_MENU_ITEMS, LOBBY_MENU_ROUTES } from "../lobbyMenu.js"

function findMenuItem(id) {
  return LOBBY_MENU_ITEMS.find((item) => item.id === id)
}

test("로비 메뉴에 게임 플레이·상점·도서관·포디움·설정 항목이 모두 있다", () => {
  const expectedLabels = {
    gameplay: "게임플레이",
    store: "상점",
    archive: "기억의 서고",
    hallOfFame: "명예의 전당",
    settings: "설정",
  }

  for (const [id, label] of Object.entries(expectedLabels)) {
    const item = findMenuItem(id)

    assert.ok(item, `로비 메뉴에 ${id} 항목이 없습니다.`)
    assert.equal(item.label, label)

    // 메뉴 버튼 이미지가 비어 있으면 화면에 아무것도 그려지지 않습니다.
    assert.equal(typeof item.src, "string")
    assert.ok(item.src.length > 0, `${id} 메뉴 버튼 이미지 경로가 비어 있습니다.`)
  }
})

test("도서관·포디움 메뉴가 /library, /podium 경로로 이동한다", () => {
  assert.equal(LOBBY_MENU_ROUTES.archive, "/library")
  assert.equal(LOBBY_MENU_ROUTES.hallOfFame, "/podium")
})

test("이동 경로가 있는 메뉴 id는 모두 메뉴 목록에 존재한다", () => {
  const menuIds = new Set(LOBBY_MENU_ITEMS.map((item) => item.id))

  for (const id of Object.keys(LOBBY_MENU_ROUTES)) {
    assert.ok(menuIds.has(id), `경로만 있고 메뉴 항목이 없는 id입니다: ${id}`)
  }
})
