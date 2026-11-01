// 채팅 입력칸 보기 훅: 여러 줄인지·커서가 마지막 줄인지·커서 줄 번호를 재고 스크롤을 맞춤
// 채팅 입력칸(InGameChatInput)이 사용, 줄 재기는 utils/textareaLines.js
import { useEffect, useLayoutEffect, useState } from "react"
import {
  getFullTextVisualLineCount,
  getTextareaCaretVisualLineIndex,
  getTextareaLineHeight,
  scrollTextareaToCaretLine,
} from "../utils/textareaLines.js"

export function useChatInputViewport(textareaRef, { value, hasText, chatTextScale }) {
  const [isVisualMultiLine, setIsVisualMultiLine] = useState(false)

  const [isOnLastVisualLine, setIsOnLastVisualLine] = useState(true)

  const [caretVisualLineIndex, setCaretVisualLineIndex] = useState(0)

  // 줄 상태를 다시 재고 스크롤 맞춤 (마지막 줄이면 맨 아래, 첫 줄이면 맨 위, 그 밖엔 커서 줄)
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
