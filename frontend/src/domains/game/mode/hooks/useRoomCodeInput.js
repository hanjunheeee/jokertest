import { useEffect, useRef } from "react"
import {
  ROOM_CODE_LENGTH,
  normalizeRoomCodeChar,
  normalizeRoomCodeText,
} from "../../shared/utils/roomCode.js"

const CODE_LENGTH = ROOM_CODE_LENGTH

export const ROOM_CODE_INPUT_ATTRIBUTES = {
  type: "text",
  inputMode: "text",
  pattern: "[A-Z0-9]",
  autoComplete: "one-time-code",
  autoCorrect: "off",
  autoCapitalize: "characters",
  spellCheck: false,
  maxLength: 1,
}

const toRoomCodeCase = (text) => text.toUpperCase()

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
    return Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? "")
  }

  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))

    if (nextChar && index < CODE_LENGTH - 1) {
      focusIndex(index + 1)
    }
  }

  const handleChange = (index, event) => {
    const raw = event.target.value

    if (!raw) {
      updateAt(index, "")
      return
    }

    const cleaned = toRoomCodeCase(normalizeRoomCodeChar(raw))
    if (!cleaned) return

    if (raw.length > 1) {
      const pasted = toRoomCodeCase(normalizeRoomCodeText(raw))
      onChange(pasted)
      focusIndex(Math.min(pasted.length, CODE_LENGTH - 1))
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

    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault()
      focusIndex(index + 1)
    }
  }

  const handlePaste = (event) => {
    event.preventDefault()

    const pasted = toRoomCodeCase(normalizeRoomCodeText(event.clipboardData.getData("text")))
    onChange(pasted)
    focusIndex(Math.min(Math.max(pasted.length - 1, 0), CODE_LENGTH - 1))
  }

  return { inputRefs, getChars, handleChange, handleKeyDown, handlePaste }
}
