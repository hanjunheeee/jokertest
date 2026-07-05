import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { INGAME_CHAT_INPUT_MAX_LENGTH } from "../../constants/ingameChatAssets.js"
import {
  INGAME_CHAT_INPUT_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_CLASS,
  INGAME_CHAT_INPUT_VIEWPORT_WRAP_CLASS,
} from "../../constants/ingameChatLayout.js"

/** 인게임 채팅 텍스트 입력 — 고정 viewport, 넘치면 줄바꿈·윗줄 clip */
const InGameChatInput = forwardRef(function InGameChatInput(
  { value, onChange, onSend, className = "" },
  ref,
) {
  const wrapRef = useRef(null)
  const textareaRef = useRef(null)

  useImperativeHandle(ref, () => wrapRef.current)

  const scrollToBottom = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.scrollTop = textarea.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [value])

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    onSend?.()
  }

  const handleChange = (event) => {
    const next = event.target.value.slice(0, INGAME_CHAT_INPUT_MAX_LENGTH)
    onChange({
      ...event,
      target: { ...event.target, value: next },
    })
    requestAnimationFrame(scrollToBottom)
  }

  return (
    <div
      ref={wrapRef}
      className={`${INGAME_CHAT_INPUT_VIEWPORT_WRAP_CLASS} ${className}`.trim()}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionEnd={scrollToBottom}
        placeholder="TYPE HERE..."
        className={`${INGAME_CHAT_INPUT_CLASS} ${INGAME_CHAT_INPUT_VIEWPORT_CLASS}`}
        aria-label="채팅 입력"
      />
    </div>
  )
})

export default InGameChatInput
