import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { INGAME_CHAT_INPUT_MAX_LENGTH } from "../../constants/chat/ingameChatAssets.js"
import {
  getInGameChatInputClass,
  getInGameChatInputPlaceholderClass,
  getInGameChatInputViewportFixedHeightClass,
  getInGameChatInputViewportSinglelineClass,
  INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_FILLED_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_NO_MASK_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import { useInGameChatVariant } from "./InGameChatVariantContext.jsx"

const TEXTAREA_MIRROR_STYLE_KEYS = [
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

const SELECTION_SYNC_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Delete",
  "Home",
  "End",
])

function getTextareaLineHeight(textarea) {
  const style = getComputedStyle(textarea)
  const lineHeight = parseFloat(style.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight

  const fontSize = parseFloat(style.fontSize)
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.35

  return 0
}

function getFullTextVisualLineCount(textarea, lineHeight) {
  if (!lineHeight || !textarea.value) return 1

  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")

  for (const key of TEXTAREA_MIRROR_STYLE_KEYS) {
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
  mirror.textContent = textarea.value

  document.body.appendChild(mirror)
  const lineCount = Math.max(1, Math.ceil(mirror.offsetHeight / lineHeight - 0.01))
  document.body.removeChild(mirror)

  return lineCount
}

/** soft wrap 포함 — 커서가 몇 번째 시각 줄인지 */
function getTextareaCaretVisualLineIndex(textarea, lineHeight) {
  if (!lineHeight) return 0

  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")

  for (const key of TEXTAREA_MIRROR_STYLE_KEYS) {
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

  const before = textarea.value.slice(0, textarea.selectionStart)
  const after = textarea.value.slice(textarea.selectionStart)
  mirror.textContent = before

  const marker = document.createElement("span")
  marker.textContent = after.charAt(0) || "\u200b"
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const lineIndex = Math.max(0, Math.round(marker.offsetTop / lineHeight))
  document.body.removeChild(mirror)

  return lineIndex
}

function scrollTextareaToCaretLine(textarea, lineHeight) {
  if (!lineHeight) return

  const caretLineIndex = getTextareaCaretVisualLineIndex(textarea, lineHeight)
  textarea.scrollTop = Math.max(0, caretLineIndex * lineHeight)
}

/** 인게임 채팅 텍스트 입력 — 고정 viewport, 넘치면 줄바꿈·윗줄 clip */
const InGameChatInput = forwardRef(function InGameChatInput(
  { value, onChange, onSend, className = "", truncateDraftOnInput = true },
  ref,
) {
  const variant = useInGameChatVariant()
  const inputClass = getInGameChatInputClass(variant)
  const placeholderClass = getInGameChatInputPlaceholderClass(variant)
  const viewportFixedHeightClass = getInGameChatInputViewportFixedHeightClass(variant)
  const viewportSinglelineClass = getInGameChatInputViewportSinglelineClass(variant)
  const wrapRef = useRef(null)
  const textareaRef = useRef(null)

  // 입력값이 실제 화면에서 두 줄 이상으로 보이는지 표시합니다.
  const [isVisualMultiLine, setIsVisualMultiLine] = useState(false)

  // 커서가 마지막 시각 줄에 있는지 표시합니다.
  const [isOnLastVisualLine, setIsOnLastVisualLine] = useState(true)

  // 커서가 현재 몇 번째 시각 줄에 있는지 저장합니다.
  const [caretVisualLineIndex, setCaretVisualLineIndex] = useState(0)
  const hasText = value.length > 0
  const showLinePeek = hasText && isVisualMultiLine && isOnLastVisualLine
  const useCenteredFirstLineViewport =
    hasText && isVisualMultiLine && !showLinePeek && caretVisualLineIndex === 0

  useImperativeHandle(ref, () => wrapRef.current)

  const syncViewport = () => {
    const textarea = textareaRef.current
    if (!textarea || !hasText) {
      setIsVisualMultiLine(false)
      setIsOnLastVisualLine(true)
      setCaretVisualLineIndex(0)
      return
    }

    const lineHeight = getTextareaLineHeight(textarea)
    const visualLineCount = getFullTextVisualLineCount(textarea, lineHeight)
    const visualMultiLine = visualLineCount >= 2
    const caretLineIndex = getTextareaCaretVisualLineIndex(textarea, lineHeight)
    const onLastVisualLine = caretLineIndex >= visualLineCount - 1

    setIsVisualMultiLine(visualMultiLine)
    setIsOnLastVisualLine(onLastVisualLine)
    setCaretVisualLineIndex(caretLineIndex)

    if (visualMultiLine && onLastVisualLine) {
      textarea.scrollTop = textarea.scrollHeight
      return
    }

    if (visualMultiLine && caretLineIndex === 0) {
      textarea.scrollTop = 0
      return
    }

    if (visualMultiLine) {
      scrollTextareaToCaretLine(textarea, lineHeight)
      return
    }

    textarea.scrollTop = 0
  }

  useLayoutEffect(() => {
    syncViewport()
  }, [value, hasText])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return undefined

    const observer = new ResizeObserver(syncViewport)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [hasText])

  const handleSelectionChange = () => {
    requestAnimationFrame(syncViewport)
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSend?.()
      return
    }

    if (SELECTION_SYNC_KEYS.has(event.key)) {
      requestAnimationFrame(syncViewport)
    }
  }

  const handleChange = (event) => {
    const next = truncateDraftOnInput
      ? event.target.value.slice(0, INGAME_CHAT_INPUT_MAX_LENGTH)
      : event.target.value
    onChange({
      ...event,
      target: { ...event.target, value: next },
    })
    requestAnimationFrame(syncViewport)
  }

  const wrapClass = [
    INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS,
    viewportFixedHeightClass,
    hasText
      ? showLinePeek
        ? INGAME_CHAT_INPUT_VIEWPORT_FILLED_CLASS
        : INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS
      : INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS,
    showLinePeek
      ? INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS
      : INGAME_CHAT_INPUT_VIEWPORT_NO_MASK_CLASS,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const textareaClass = [
    inputClass,
    hasText
      ? useCenteredFirstLineViewport || !isVisualMultiLine
        ? viewportSinglelineClass
        : INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS
      : viewportSinglelineClass,
  ].join(" ")

  return (
    <div
      ref={wrapRef}
      className={wrapClass}
      onClick={() => textareaRef.current?.focus()}
    >
      {!hasText ? (
        <span className={placeholderClass} aria-hidden="true">
          TYPE HERE...
        </span>
      ) : null}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        onSelect={handleSelectionChange}
        onCompositionEnd={syncViewport}
        placeholder=""
        className={textareaClass}
        aria-label="채팅 입력"
      />
    </div>
  )
})

export default InGameChatInput
