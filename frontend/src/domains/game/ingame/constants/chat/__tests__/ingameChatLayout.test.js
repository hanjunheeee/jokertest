import test from "node:test"
import assert from "node:assert/strict"
import {
  INGAME_CHAT_MESSAGE_LIST_INSET,
  INGAME_CHAT_STATUS_LINE_INSET,
  INGAME_CHAT_TEXT_FIELD_INSET,
} from "../ingameChatBoardLayout.js"
import {
  INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET,
  INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET,
  INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET,
} from "../closeup/ingameChatCloseupLayout.js"

function toPercent(value) {
  assert.equal(typeof value, "string")
  assert.match(value, /%$/)
  return Number.parseFloat(value)
}

/** top+height가 없으면 100-bottom-height를 top으로 취급해 세로 구간 [start, end]를 얻는다 */
function verticalBand(inset) {
  const height = toPercent(inset.height)
  if (inset.top != null) {
    const start = toPercent(inset.top)
    return { start, end: start + height }
  }
  const start = 100 - toPercent(inset.bottom) - height
  return { start, end: start + height }
}

test("INGAME_CHAT_STATUS_LINE_INSET: 보드 상태·오류 문구 inset이 정의되어 있다", () => {
  assert.ok(INGAME_CHAT_STATUS_LINE_INSET)
  assert.ok(INGAME_CHAT_STATUS_LINE_INSET.height)
  assert.ok(INGAME_CHAT_STATUS_LINE_INSET.left)
  assert.ok(INGAME_CHAT_STATUS_LINE_INSET.right)
})

test("INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET: 클로즈업 상태·오류 문구 inset이 정의되어 있다", () => {
  assert.ok(INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET)
  assert.ok(INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET.height)
  assert.ok(INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET.left)
  assert.ok(INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET.right)
})

test("보드/클로즈업 상태·오류 문구 inset은 서로 다른 값이다", () => {
  assert.notDeepEqual(
    INGAME_CHAT_STATUS_LINE_INSET,
    INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET,
  )
})

test("보드 상태·오류 문구 inset은 메시지 목록·입력줄 inset과 겹치지 않는다", () => {
  assert.notDeepEqual(INGAME_CHAT_STATUS_LINE_INSET, INGAME_CHAT_MESSAGE_LIST_INSET)
  assert.notDeepEqual(INGAME_CHAT_STATUS_LINE_INSET, INGAME_CHAT_TEXT_FIELD_INSET)

  const messageList = verticalBand(INGAME_CHAT_MESSAGE_LIST_INSET)
  const statusLine = verticalBand(INGAME_CHAT_STATUS_LINE_INSET)
  const textField = verticalBand(INGAME_CHAT_TEXT_FIELD_INSET)

  assert.ok(
    messageList.end <= statusLine.start,
    "상태 줄은 메시지 목록 하단보다 아래에서 시작해야 한다",
  )
  assert.ok(
    statusLine.end <= textField.start,
    "상태 줄은 입력줄 상단보다 위에서 끝나야 한다",
  )
})

test("클로즈업 상태·오류 문구 inset은 메시지 목록·입력줄 inset과 겹치지 않는다", () => {
  assert.notDeepEqual(
    INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET,
    INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET,
  )
  assert.notDeepEqual(
    INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET,
    INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET,
  )

  const messageList = verticalBand(INGAME_CHAT_CLOSEUP_MESSAGE_LIST_INSET)
  const statusLine = verticalBand(INGAME_CHAT_CLOSEUP_STATUS_LINE_INSET)
  const textField = verticalBand(INGAME_CHAT_CLOSEUP_TEXT_FIELD_INSET)

  assert.ok(
    messageList.end <= statusLine.start,
    "상태 줄은 메시지 목록 하단보다 아래에서 시작해야 한다",
  )
  assert.ok(
    statusLine.end <= textField.start,
    "상태 줄은 입력줄 상단보다 위에서 끝나야 한다",
  )
})
