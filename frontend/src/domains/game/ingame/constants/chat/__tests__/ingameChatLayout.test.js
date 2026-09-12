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
  getInGameChatInputClass,
  getInGameChatInputPlaceholderClass,
  getInGameChatMessageBodyClass,
  getInGameChatMessageSenderClass,
  getInGameChatMessageTimeClass,
  getInGameChatScaledTypographyClass,
  getInGameChatTextScale,
  getInGameChatTextScaleStyle,
  getInGameChatTextTypographyClass,
  INGAME_CHAT_TEXT_SCALE_CSS_VAR,
} from "../ingameChatLayout.js"

/** `text-[...]` 유틸리티의 인자 부분만 떼어낸다 — 중첩 괄호가 있어 끝까지 짝을 센다. */
function fontSizeArgument(className) {
  const start = className.indexOf("text-[clamp(")
  assert.notEqual(start, -1, `타이포 클래스에 clamp() font-size가 없습니다: ${className}`)

  const open = className.indexOf("[", start)
  let depth = 0
  for (let i = open; i < className.length; i += 1) {
    if (className[i] === "[") depth += 1
    if (className[i] === "]") {
      depth -= 1
      if (depth === 0) return className.slice(open + 1, i)
    }
  }
  assert.fail(`닫히지 않은 text-[...]: ${className}`)
}

/** clamp(a,b,c)의 세 항을 최상위 콤마 기준으로 나눈다(calc(...) 안의 콤마는 무시). */
function clampTerms(fontSizeArg) {
  const inner = fontSizeArg.slice("clamp(".length, -1)
  const terms = []
  let depth = 0
  let current = ""
  for (const char of inner) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      terms.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  terms.push(current.trim())
  return terms
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

// F-15(AC-02): 배율 적용 타이포는 clamp의 최소·선호·최대 세 항에 모두 같은 배율을
// 곱한다 — 이전 구현처럼 선호값만 바꾸고 경계를 버리면 배율을 낮춰도 원래 min에 걸려
// 실제로 작아지지 않는 구간이 생긴다.
test("배율 타이포는 clamp의 세 항을 모두 유지한다 — 최소·최대 경계를 버리지 않는다", () => {
  for (const variant of ["board", "closeup"]) {
    const terms = clampTerms(fontSizeArgument(getInGameChatScaledTypographyClass(variant)))

    assert.equal(terms.length, 3, `${variant}: clamp는 세 항이어야 한다`)
    for (const term of terms) {
      assert.match(
        term,
        new RegExp(`^calc\\([\\d.]+[a-z%]+\\*var\\(${INGAME_CHAT_TEXT_SCALE_CSS_VAR},1\\)\\)$`),
        `${variant}: 모든 항이 배율 변수를 곱해야 한다 — ${term}`,
      )
    }
  }
})

test("배율 타이포의 각 항은 기본 타이포의 같은 항에 배율만 곱한 값이다(리터럴 어긋남 방지)", () => {
  for (const variant of ["board", "closeup"]) {
    const baseTerms = clampTerms(fontSizeArgument(getInGameChatTextTypographyClass(variant)))
    const scaledTerms = clampTerms(fontSizeArgument(getInGameChatScaledTypographyClass(variant)))

    assert.equal(baseTerms.length, 3)
    baseTerms.forEach((baseTerm, index) => {
      assert.equal(
        scaledTerms[index],
        `calc(${baseTerm}*var(${INGAME_CHAT_TEXT_SCALE_CSS_VAR},1))`,
        `${variant}: ${index}번째 항이 기본 타이포와 어긋났다`,
      )
    })
  }
})

test("배율 타이포는 font-size 말고는 기본 타이포와 완전히 같다(굵기·자간·색 유지)", () => {
  for (const variant of ["board", "closeup"]) {
    const base = getInGameChatTextTypographyClass(variant)
    const scaled = getInGameChatScaledTypographyClass(variant)

    const strip = (className, argument) => className.replace(`text-[${argument}]`, "")

    assert.equal(
      strip(scaled, fontSizeArgument(scaled)),
      strip(base, fontSizeArgument(base)),
      `${variant}: font-size 외의 타이포가 달라졌다`,
    )
  }
})

// 배율 변수가 없으면 fallback 1 → calc(x*1) === x라 기존 화면과 동일하다.
test("getInGameChatTextScaleStyle: 기본값(100)은 배율 변수 1을 내려준다", () => {
  const style = getInGameChatTextScaleStyle(100)
  assert.equal(style[INGAME_CHAT_TEXT_SCALE_CSS_VAR], "1")
})

test("getInGameChatTextScaleStyle: 슬라이더를 낮추면 1보다 작은 배율을 내려준다", () => {
  assert.equal(getInGameChatTextScaleStyle(0)[INGAME_CHAT_TEXT_SCALE_CSS_VAR], "0.6")
  assert.ok(Number(getInGameChatTextScaleStyle(50)[INGAME_CHAT_TEXT_SCALE_CSS_VAR]) < 1)
})

test("getInGameChatTextScaleStyle: 저장된 적 없는(숫자 아님) 값은 배율 1로 대체한다", () => {
  assert.equal(getInGameChatTextScaleStyle(undefined)[INGAME_CHAT_TEXT_SCALE_CSS_VAR], "1")
})

// 채팅 본문·발신자·시각·입력·placeholder가 모두 같은 배율 타이포를 쓴다 — 하나라도
// 기본 타이포(배율 없음)를 그대로 쓰면 그 요소만 설정에 반응하지 않는다.
test("채팅 텍스트 클래스는 보드·클로즈업 모두 배율 타이포를 쓴다", () => {
  const getters = [
    getInGameChatMessageBodyClass,
    getInGameChatMessageSenderClass,
    getInGameChatMessageTimeClass,
    getInGameChatInputClass,
    getInGameChatInputPlaceholderClass,
  ]

  for (const variant of ["board", "closeup"]) {
    const baseFontSize = `text-[${fontSizeArgument(getInGameChatTextTypographyClass(variant))}]`
    const scaledFontSize = `text-[${fontSizeArgument(getInGameChatScaledTypographyClass(variant))}]`

    for (const getClassName of getters) {
      const className = getClassName(variant)
      assert.ok(
        className.includes(scaledFontSize),
        `${getClassName.name}(${variant})이 배율 타이포를 쓰지 않는다`,
      )
      assert.ok(
        !className.includes(baseFontSize),
        `${getClassName.name}(${variant})에 배율 없는 기본 font-size가 남아 있다`,
      )
    }
  }
})

// F-15(AC-02): "채팅 시간 표시"가 켜졌을 때 쓰는 시각 표기 클래스.
test("getInGameChatMessageTimeClass: 보드·클로즈업 모두 non-empty 클래스를 돌려주고 서로 다르다", () => {
  const board = getInGameChatMessageTimeClass("board")
  const closeup = getInGameChatMessageTimeClass("closeup")

  assert.ok(board.length > 0)
  assert.ok(closeup.length > 0)
  assert.notEqual(board, closeup)
})
