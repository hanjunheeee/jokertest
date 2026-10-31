import assert from "node:assert/strict"
import test from "node:test"
import { SETTING_TABS } from "../../../../src/domains/settings/constants/settingTabs.js"
import { SOUND_SETTING_VOLUMES } from "../../../../src/domains/settings/constants/soundSettings.js"

test("설정 탭은 일반·사운드 두 개다", () => {
  assert.equal(SETTING_TABS.length, 2)

  const ids = SETTING_TABS.map((tab) => tab.id)
  assert.deepEqual(ids, ["general", "sound"])

  for (const tab of SETTING_TABS) {
    assert.equal(typeof tab.label, "string")
    assert.ok(tab.label.length > 0, `${tab.id} 탭 라벨이 비어 있습니다.`)
  }
})

test("사운드 항목은 id·label·min·max·defaultValue를 모두 갖는다", () => {
  assert.ok(SOUND_SETTING_VOLUMES.length > 0)

  for (const item of SOUND_SETTING_VOLUMES) {
    assert.equal(typeof item.id, "string")
    assert.equal(typeof item.label, "string")
    assert.equal(typeof item.min, "number")
    assert.equal(typeof item.max, "number")
    assert.equal(typeof item.defaultValue, "number")
    assert.ok(item.defaultValue >= item.min && item.defaultValue <= item.max)
  }
})

test("사운드 항목 id는 중복되지 않는다", () => {
  const ids = SOUND_SETTING_VOLUMES.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
})
