// 양피지 안내 창 대기열 시험 (alert 뒤 바로 새로 읽어도 안내가 남는지, MO-018)
import { test } from "node:test"
import assert from "node:assert/strict"

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  }
}

const MODULE = "../../src/shared/ui/modal/parchment/parchmentAlert.js"

test("안 닫은 안내는 새로 읽은 뒤 다시 뜨고, 닫으면 저장소에서 지워짐", async () => {
  globalThis.sessionStorage = fakeStorage()
  globalThis.window = globalThis
  const first = await import(`${MODULE}?load=1`)
  first.installParchmentAlert()
  window.alert("다른 기기에서 로그인되어 종료")
  assert.equal(first.getParchmentAlertMessage(), "다른 기기에서 로그인되어 종료")

  // location.replace 뒤 새 화면 = 모듈 새로 읽기
  const second = await import(`${MODULE}?load=2`)
  assert.equal(second.getParchmentAlertMessage(), null)
  second.installParchmentAlert()
  assert.equal(second.getParchmentAlertMessage(), "다른 기기에서 로그인되어 종료")

  second.dismissParchmentAlert()
  assert.equal(second.getParchmentAlertMessage(), null)
  const third = await import(`${MODULE}?load=3`)
  third.installParchmentAlert()
  assert.equal(third.getParchmentAlertMessage(), null)
})

test("여러 개면 차례대로 보임", async () => {
  globalThis.sessionStorage = fakeStorage()
  globalThis.window = globalThis
  const mod = await import(`${MODULE}?load=4`)
  mod.showParchmentAlert("하나")
  mod.showParchmentAlert("둘")
  assert.equal(mod.getParchmentAlertMessage(), "하나")
  mod.dismissParchmentAlert()
  assert.equal(mod.getParchmentAlertMessage(), "둘")
})
