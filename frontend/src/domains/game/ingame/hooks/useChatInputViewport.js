// 채팅 입력칸 줄 재기 훅: 여러 줄인지·커서 줄 위치 재고 스크롤 맞춤
// 채팅 입력칸(InGameChatInput)이 사용, 줄 재기는 utils/textareaLines.js
import { useEffect, useLayoutEffect, useState } from "react"
import {
  getVisualLineCount,
  getCaretLineIndex,
  getTextareaLineHeight,
  scrollToCaretLine,
} from "../utils/textareaLines.js"

// 입력칸 줄 상태 셋과 다시 재기 함수 돌려줌 (입력칸이 키 입력 때도 부름)
export function useChatInputViewport(textareaRef, { value, hasText, chatTextScale }) {
  const [isVisualMultiLine, setIsVisualMultiLine] = useState(false)

  const [isOnLastVisualLine, setIsOnLastVisualLine] = useState(true)

  const [caretVisualLineIndex, setCaretVisualLineIndex] = useState(0)

  // 줄 상태 다시 재고 스크롤 맞춤
  const syncViewport = () => {
    const textarea = textareaRef.current
    // 입력칸이 없거나 글이 없으면 한 줄 상태로 되돌림
    if (!textarea || !hasText) {
      setIsVisualMultiLine(false)
      setIsOnLastVisualLine(true)
      setCaretVisualLineIndex(0)
      return
    }

    const lineHeight = getTextareaLineHeight(textarea)
    const visualLineCount = getVisualLineCount(textarea, lineHeight)
    const visualMultiLine = visualLineCount >= 2
    const caretLineIndex = getCaretLineIndex(textarea, lineHeight)
    const onLastVisualLine = caretLineIndex >= visualLineCount - 1

    setIsVisualMultiLine(visualMultiLine)
    setIsOnLastVisualLine(onLastVisualLine)
    setCaretVisualLineIndex(caretLineIndex)

    // 여러 줄이면 커서 따라감 (마지막 줄은 맨 아래, 첫 줄은 맨 위), 한 줄이면 맨 위
    if (visualMultiLine && onLastVisualLine) {
      textarea.scrollTop = textarea.scrollHeight
      return
    }

    if (visualMultiLine && caretLineIndex === 0) {
      textarea.scrollTop = 0
      return
    }

    if (visualMultiLine) {
      scrollToCaretLine(textarea, lineHeight)
      return
    }

    textarea.scrollTop = 0
  }

  // 글·글자 크기가 바뀌면 그리기 전에 다시 잼
  useLayoutEffect(() => {
    syncViewport()
  }, [value, hasText, chatTextScale])

  // 입력칸 크기가 바뀌어도 다시 잼
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return undefined

    const observer = new ResizeObserver(syncViewport)
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [hasText])

  return { isVisualMultiLine, isOnLastVisualLine, caretVisualLineIndex, syncViewport }
}
