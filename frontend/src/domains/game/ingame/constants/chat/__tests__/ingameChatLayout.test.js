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
import {
  getInGameChatMessageTimeClass,
  getInGameChatScaledFontSize,
  getInGameChatTextScale,
  getInGameChatTextTypographyClass,
} from "../ingameChatLayout.js"

function parseValue(fontSize) {
  const match = fontSize.match(/^(-?[\d.]+)([a-z%]*)$/i)
  assert.ok(match, `단일 CSS 길이 값이 아닙니다: ${fontSize}`)
  return { number: Number.parseFloat(match[1]), unit: match[2] }
}

function basePreferredTerm(variant) {
  const baseClass = getInGameChatTextTypographyClass(variant)
  const match = baseClass.match(/text-\[clamp\(([^)]+)\)\]/)
  assert.ok(match, `${variant} 타이포 클래스에 clamp()가 없습니다`)
  const terms = match[1].split(",").map((term) => term.trim())
  assert.equal(terms.length, 3)
  return parseValue(terms[1])
}

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

// F-15(AC-02): 채팅 글자 크기 설정(0~100, 기본값 100)을 실제 폰트 배율로 바꾸는 함수.
test("getInGameChatTextScale: 기본값(100)은 배율 1이다 — 저장한 적 없으면 기존 화면과 같아야 한다", () => {
  assert.equal(getInGameChatTextScale(100), 1)
})

test("getInGameChatTextScale: 0~100 범위를 벗어나면 clamp하고, 숫자가 아니면 1(기본)로 대체한다", () => {
  assert.equal(getInGameChatTextScale(150), getInGameChatTextScale(100))
  assert.equal(getInGameChatTextScale(-10), getInGameChatTextScale(0))
  assert.equal(getInGameChatTextScale(Number.NaN), 1)
  assert.equal(getInGameChatTextScale(undefined), 1)
})

test("getInGameChatTextScale: 값이 작을수록 배율도 단조 감소한다(최대 40%까지만 줄어듦)", () => {
  const scale0 = getInGameChatTextScale(0)
  const scale50 = getInGameChatTextScale(50)
  const scale100 = getInGameChatTextScale(100)

  assert.ok(scale0 < scale50 && scale50 < scale100)
  assert.equal(scale0, 0.6)
  assert.equal(scale100, 1)
})

// F-15(AC-02): scale===1(기본값)이면 인라인 스타일을 얹지 않는다 — 기존 화면과 완전히 동일.
test("getInGameChatScaledFontSize: 배율이 1이면 null을 돌려준다(보드·클로즈업 공통)", () => {
  assert.equal(getInGameChatScaledFontSize("board", 1), null)
  assert.equal(getInGameChatScaledFontSize("closeup", 1), null)
})

test("getInGameChatScaledFontSize: 보드·클로즈업 모두 clamp() 선호값(가운데 항)을 같은 비율로 조정한다", () => {
  for (const variant of ["board", "closeup"]) {
    const scale = 0.8
    const base = basePreferredTerm(variant)

    const scaledFontSize = getInGameChatScaledFontSize(variant, scale)
    const scaled = parseValue(scaledFontSize)

    assert.equal(scaled.unit, base.unit)
    assert.ok(Math.abs(scaled.number - base.number * scale) < 1e-6)
  }
})

test("getInGameChatScaledFontSize: cqi 단위를 그대로 보존한다(rem으로 바뀌지 않는다)", () => {
  const scaledFontSize = getInGameChatScaledFontSize("board", 0.5)
  assert.match(scaledFontSize, /^[\d.]+cqi$/)
})

test("getInGameChatScaledFontSize: 잘못된 scale이면 null을 돌려준다", () => {
  assert.equal(getInGameChatScaledFontSize("board", Number.NaN), null)
  assert.equal(getInGameChatScaledFontSize("board", undefined), null)
})

// F-15(AC-02): "채팅 시간 표시"가 켜졌을 때 쓰는 시각 표기 클래스.
test("getInGameChatMessageTimeClass: 보드·클로즈업 모두 non-empty 클래스를 돌려주고 서로 다르다", () => {
  const board = getInGameChatMessageTimeClass("board")
  const closeup = getInGameChatMessageTimeClass("closeup")

  assert.ok(board.length > 0)
  assert.ok(closeup.length > 0)
  assert.notEqual(board, closeup)
})
