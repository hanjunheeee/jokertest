// 3장 useScrollbarSync: 스크롤된 채 다시 재도 막대 칸이 위로 밀리지 않음
import test from "node:test"
import assert from "node:assert/strict"

const { measureSettingRows } = await import("../../../../src/domains/settings/hooks/useScrollbarSync.js")

const rect = (top, bottom) => ({ top, bottom, getBoundingClientRect: () => ({ top, bottom }) })

test("스크롤된 만큼 더해 첫 줄 위치를 내용 기준으로 잼", () => {
  const rows = [rect(-60, -20), rect(-20, 40)]
  const list = {
    scrollTop: 100,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll: () => rows,
  }
  // 스크롤 전 첫 줄은 칸 위에서 40px 아래 (−60 + 100)
  assert.deepEqual(measureSettingRows(list), { top: 40, height: 100 })
})

test("줄이 없으면 null", () => {
  assert.equal(measureSettingRows({ querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }) }), null)
})
