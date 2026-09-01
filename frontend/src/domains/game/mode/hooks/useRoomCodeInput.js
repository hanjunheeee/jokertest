import { useEffect, useRef } from "react"
import {
  ROOM_CODE_LENGTH,
  sanitizeRoomCode,
  sanitizeRoomCodeChar,
} from "@/domains/game/mode/utils/sanitizeRoomCode.js"

// 방코드 6칸 입력의 포커스 이동, 붙여넣기, 삭제 동작을 처리하는 훅입니다.
export function useRoomCodeInput({ value, onChange, autoFocus, disabled, readOnly }) {
  const inputRefs = useRef([])

  const focusIndex = (index) => {
    const input = inputRefs.current[index]
    if (!input) return

    input.focus()
    input.select()
  }

  useEffect(() => {
    if (!autoFocus || disabled || readOnly) return

    const timer = window.setTimeout(() => focusIndex(0), 280)
    return () => window.clearTimeout(timer)
  }, [autoFocus, disabled, readOnly])

  const getChars = () => {
    return Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => value[index] ?? "")
  }

  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))

    // 한 칸을 입력하면 다음 칸으로 자동 이동합니다.
    if (nextChar && index < ROOM_CODE_LENGTH - 1) {
      focusIndex(index + 1)
    }
  }

  const handleChange = (index, event) => {
    const raw = event.target.value

    if (!raw) {
      updateAt(index, "")
      return
    }

    const cleaned = sanitizeRoomCodeChar(raw)
    if (!cleaned) return

    if (raw.length > 1) {
      // 자동완성/붙여넣기로 한 칸에 여러 글자가 들어오면 전체 방코드로 처리합니다.
      const pasted = sanitizeRoomCode(raw)
      onChange(pasted)
      focusIndex(Math.min(pasted.length, ROOM_CODE_LENGTH - 1))
      return
    }

    updateAt(index, cleaned)
  }

  const handleKeyDown = (index, event) => {
    const chars = getChars()

    if (event.key === "Backspace") {
      event.preventDefault()

      if (chars[index]) {
        updateAt(index, "")
        return
      }

      if (index > 0) {
        updateAt(index - 1, "")
        focusIndex(index - 1)
      }
      return
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault()
      focusIndex(index - 1)
      return
    }

    if (event.key === "ArrowRight" && index < ROOM_CODE_LENGTH - 1) {
      event.preventDefault()
      focusIndex(index + 1)
    }
  }

  const handlePaste = (event) => {
    event.preventDefault()

    const pasted = sanitizeRoomCode(event.clipboardData.getData("text"))
    onChange(pasted)
    focusIndex(Math.min(Math.max(pasted.length - 1, 0), ROOM_CODE_LENGTH - 1))
  }

  return { inputRefs, getChars, handleChange, handleKeyDown, handlePaste }
}
