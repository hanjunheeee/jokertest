// 채팅 입력칸: 여러 줄 글을 한 줄 높이 칸 안에서 보여 주고, Enter로 보내기
// 채팅 내용(InGameChatContent)이 사용, 줄 재기·스크롤은 useChatInputViewport
import { forwardRef, useImperativeHandle, useRef } from "react"
import { INGAME_CHAT_INPUT_MAX_LENGTH } from "../../constants/chat/ingameChatAssets.js"
import {
  getInGameChatInputClass,
  getInGameChatInputPlaceholderClass,
  getInGameChatInputViewportFixedHeightClass,
  getInGameChatInputViewportSinglelineClass,
  getInGameChatScaledFontSize,
  getInGameChatTextScale,
  getInGameChatTextScaleStyle,
  INGAME_CHAT_INPUT_VIEWPORT_EMPTY_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_FILLED_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_MASK_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_MULTILINE_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_NO_MASK_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_WRAP_BASE_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import { INGAME_SETTING_CHAT_SLIDER } from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"
import { useInGameChatVariant } from "./InGameChatVariantContext.jsx"
import { useChatInputViewport } from "../../hooks/useChatInputViewport.js"

// 설정한 채팅 글자 크기 (없으면 기본값)
function selectChatTextSize(state) {
  return state.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
}

// 커서를 옮기는 키를 누르면 다음 프레임에 줄 상태를 다시 잼
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

  const chatTextSize = useSettingsStore(selectChatTextSize)
  const chatTextScale = getInGameChatTextScale(chatTextSize)
  const chatTextScaleStyle = getInGameChatTextScaleStyle(chatTextSize)

  const hasText = value.length > 0

  useImperativeHandle(ref, () => wrapRef.current)

  const { isVisualMultiLine, isOnLastVisualLine, caretVisualLineIndex, syncViewport } =
    useChatInputViewport(textareaRef, { value, hasText, chatTextScale })
  // 여러 줄인데 커서가 마지막 줄이면 윗줄을 살짝 보여 주고, 첫 줄이면 한 줄짜리처럼 가운데 둠
  const showLinePeek = hasText && isVisualMultiLine && isOnLastVisualLine
  const useCenteredFirstLineViewport =
    hasText && isVisualMultiLine && !showLinePeek && caretVisualLineIndex === 0

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

  const textareaFontSizeStyle = { fontSize: getInGameChatScaledFontSize(variant) }

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
      style={chatTextScaleStyle}
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
        style={textareaFontSizeStyle}
        aria-label="채팅 입력"
      />
    </div>
  )
})

export default InGameChatInput

