// 입력칸 보이는 줄 재기: 줄 높이, 전체 글의 보이는 줄 수, 커서가 있는 줄, 커서 줄로 스크롤
// 채팅 입력칸 보기 훅(useChatInputViewport)이 사용 (숨긴 거울 div를 잠깐 붙여 재고 바로 뗌)

// 거울 div에 그대로 옮길 입력칸 글자·여백 모양
const MIRROR_STYLE_KEYS = [
  "boxSizing",
  "width",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderWidth",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
]

// 줄 높이 (줄 높이가 없으면 글자 크기 × 1.35, 그것도 없으면 0)
export function getTextareaLineHeight(textarea) {
  const style = getComputedStyle(textarea)
  const lineHeight = parseFloat(style.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight

  const fontSize = parseFloat(style.fontSize)
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.35

  return 0
}

// 입력칸과 같은 모양으로 줄바꿈되는 숨긴 거울 div (아직 문서에 안 붙임)
function createMirror(textarea) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")

  for (const key of MIRROR_STYLE_KEYS) {
    mirror.style[key] = style[key]
  }

  mirror.style.position = "absolute"
  mirror.style.visibility = "hidden"
  mirror.style.pointerEvents = "none"
  mirror.style.top = "0"
  mirror.style.left = "-9999px"
  mirror.style.height = "auto"
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.overflow = "hidden"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.wordBreak = "break-word"
  mirror.style.overflowWrap = "anywhere"
  return mirror
}

// 전체 글이 보이는 줄 몇 줄인지 (글이 없거나 줄 높이를 모르면 1)
export function getVisualLineCount(textarea, lineHeight) {
  if (!lineHeight || !textarea.value) return 1

  const mirror = createMirror(textarea)
  mirror.textContent = textarea.value

  document.body.appendChild(mirror)
  const lineCount = Math.max(1, Math.ceil(mirror.offsetHeight / lineHeight - 0.01))
  document.body.removeChild(mirror)

  return lineCount
}

// 커서가 몇 번째 보이는 줄에 있는지 (커서 뒤 글자 하나를 표시로 붙여 위치를 잼)
export function getCaretLineIndex(textarea, lineHeight) {
  if (!lineHeight) return 0

  const mirror = createMirror(textarea)

  const before = textarea.value.slice(0, textarea.selectionStart)
  const after = textarea.value.slice(textarea.selectionStart)
  mirror.textContent = before

  const marker = document.createElement("span")
  marker.textContent = after.charAt(0) || "​"
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const lineIndex = Math.max(0, Math.round(marker.offsetTop / lineHeight))
  document.body.removeChild(mirror)

  return lineIndex
}

// 커서가 있는 줄이 맨 위에 오게 스크롤
export function scrollToCaretLine(textarea, lineHeight) {
  if (!lineHeight) return

  const caretLineIndex = getCaretLineIndex(textarea, lineHeight)
  textarea.scrollTop = Math.max(0, caretLineIndex * lineHeight)
}
