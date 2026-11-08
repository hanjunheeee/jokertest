// 6차 묶음: 이모티콘 말풍선 스토어(가짜 시계로 3초 뒤 지움)와 이모티콘 아이템 찾기
import test, { mock } from "node:test"
import assert from "node:assert/strict"

import {
  INGAME_EMOJI_BUBBLE_DURATION_MS,
  useInGameEmojiBubbleStore,
} from "../../src/domains/game/ingame/store/inGameEmojiBubble.store.js"
import { findInGameEmoticonItem } from "../../src/domains/game/ingame/utils/findInGameEmoticonItem.js"

const store = () => useInGameEmojiBubbleStore.getState()

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] })
  store().clearAllActiveEmoji()
})
test.afterEach(() => {
  store().clearAllActiveEmoji()
  mock.timers.reset()
})

test("말풍선: 띄우면 3초 동안 보이고 3초가 되면 지워짐", () => {
  store().setActiveEmoji("u1", "emoji-basic-reject", 100)
  assert.deepEqual(store().byUuid.u1, { itemId: "emoji-basic-reject", sentAt: 100 })
  mock.timers.tick(INGAME_EMOJI_BUBBLE_DURATION_MS - 1)
  assert.ok(store().byUuid.u1)
  mock.timers.tick(1)
  assert.equal(store().byUuid.u1, undefined)
})

test("말풍선: 같은 사람이 다시 보내면 시간을 처음부터 다시 셈", () => {
  store().setActiveEmoji("u1", "emoji-basic-reject", 1)
  mock.timers.tick(2000)
  store().setActiveEmoji("u1", "emoji-basic-tears", 2)
  mock.timers.tick(2000)
  assert.equal(store().byUuid.u1.itemId, "emoji-basic-tears")
  mock.timers.tick(1000)
  assert.equal(store().byUuid.u1, undefined)
})

test("말풍선: 빈 uuid·빈 아이템 id는 무시, 시각이 숫자가 아니면 null로", () => {
  store().setActiveEmoji("", "emoji-basic-reject", 1)
  store().setActiveEmoji("u1", "", 1)
  assert.deepEqual(store().byUuid, {})
  store().setActiveEmoji("u2", "emoji-basic-reject", "later")
  assert.equal(store().byUuid.u2.sentAt, null)
})

test("말풍선: 한 사람만 지우면 다른 사람 말풍선은 남음", () => {
  store().setActiveEmoji("u1", "emoji-basic-reject", 1)
  store().setActiveEmoji("u2", "emoji-basic-tears", 1)
  store().removeActiveEmoji("u1")
  assert.deepEqual(Object.keys(store().byUuid), ["u2"])
})

test("말풍선: 없는 사람 지우기·빈 상태 전부 지우기는 상태 객체를 안 바꿈", () => {
  const before = store().byUuid
  store().removeActiveEmoji("nobody")
  store().clearAllActiveEmoji()
  assert.equal(store().byUuid, before)
})

test("말풍선: 전부 지우면 남은 타이머도 꺼져 나중에 다시 띄운 것이 일찍 안 지워짐", () => {
  store().setActiveEmoji("u1", "emoji-basic-reject", 1)
  mock.timers.tick(2500)
  store().clearAllActiveEmoji()
  store().setActiveEmoji("u1", "emoji-basic-tears", 2)
  mock.timers.tick(1000)
  assert.equal(store().byUuid.u1.itemId, "emoji-basic-tears")
})

test("이모티콘 아이템: 이모티콘 종류만 찾고 스킨·없는 id·빈 id는 null", () => {
  assert.equal(findInGameEmoticonItem("emoji-basic-reject").category, "이모티콘")
  assert.equal(findInGameEmoticonItem("player-skin-경비원1-바이올렛"), null)
  assert.equal(findInGameEmoticonItem("emoji-none"), null)
  assert.equal(findInGameEmoticonItem(""), null)
  assert.equal(findInGameEmoticonItem(42), null)
})
