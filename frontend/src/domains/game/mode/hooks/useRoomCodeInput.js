// 방코드 입력 칸 동작: 칸마다 한 글자, 대문자로 바꿈, 붙여넣기·지우기·화살표 이동
// RoomCodeInput이 씀, 칸 속성 ROOM_CODE_INPUT_ATTRIBUTES도 여기서 같이 내보냄
import { useEffect, useRef } from "react"
import {
  ROOM_CODE_LENGTH,
  normalizeRoomCodeChar,
  normalizeRoomCodeText,
} from "../../shared/utils/roomCode.js"

// 칸 수 = 방 코드 길이
const CODE_LENGTH = ROOM_CODE_LENGTH

// 칸마다 붙는 입력 속성 (한 글자·대문자 입력·자동 고침 끔)
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

// 대문자로 바꾸기
const toRoomCodeCase = (text) => text.toUpperCase()

// 방코드 입력 칸 상태·처리 함수
export function useRoomCodeInput({ value, onChange, autoFocus, disabled, readOnly }) {
  const inputRefs = useRef([])

  // 그 칸으로 초점 옮기고 글자 선택 (덮어쓰기 쉽게)
  const focusIndex = (index) => {
    const input = inputRefs.current[index]
    if (!input) return

    input.focus()
    input.select()
  }

  // 자동 초점: 화면 나타난 뒤(0.28초) 첫 칸에, 잠김·읽기 전용이면 안 함
  useEffect(() => {
    if (!autoFocus || disabled || readOnly) return

    const timer = window.setTimeout(() => focusIndex(0), 280)
    return () => window.clearTimeout(timer)
  }, [autoFocus, disabled, readOnly])

  // 칸 수만큼 글자 배열 (빈 칸은 "")
  const getChars = () => {
    return Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? "")
  }

  // 한 칸 바꾸고, 글자 넣었으면 다음 칸으로
  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))

    if (nextChar && index < CODE_LENGTH - 1) {
      focusIndex(index + 1)
    }
  }

  // 칸 입력 처리
  const handleChange = (index, event) => {
    const raw = event.target.value

    // 지웠으면 그 칸 비움
    if (!raw) {
      updateAt(index, "")
      return
    }

    // 허용 글자만 남긴 마지막 한 글자, 못 쓰는 글자뿐이면 무시
    const cleaned = toRoomCodeCase(normalizeRoomCodeChar(raw))
    if (!cleaned) return

    // 여러 글자가 한 번에 들어오면 붙여넣기로 보고 통째로 바꿈
    if (raw.length > 1) {
      const pasted = toRoomCodeCase(normalizeRoomCodeText(raw))
      onChange(pasted)
      focusIndex(Math.min(pasted.length, CODE_LENGTH - 1))
      return
    }

    updateAt(index, cleaned)
  }

  // 지우기·화살표 처리
  const handleKeyDown = (index, event) => {
    const chars = getChars()

    // 지우기: 글자 있으면 그 칸 비우고, 없으면 앞 칸 비우고 앞으로
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

    // 화살표: 옆 칸으로
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

  // 붙여넣기: 정리한 코드로 통째로 바꾸고 붙인 마지막 글자 칸으로 초점
  const handlePaste = (event) => {
    event.preventDefault()

    const pasted = toRoomCodeCase(normalizeRoomCodeText(event.clipboardData.getData("text")))
    onChange(pasted)
    focusIndex(Math.min(Math.max(pasted.length - 1, 0), CODE_LENGTH - 1))
  }

  return { inputRefs, getChars, handleChange, handleKeyDown, handlePaste }
}
