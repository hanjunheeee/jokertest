import { useEffect, useRef } from "react"
// 방코드의 문자·길이 규칙은 표시 화면(matching)과 공유합니다. 여기에 규칙을 다시 적으면
// 한쪽만 바뀌었을 때 "보이는데 입력은 안 되는 코드"가 생기므로 출처를 하나로 둡니다.
// 경로 별칭(@/) 대신 상대 경로를 쓰는 이유는, 이 훅의 테스트가 별칭을 해석하지 못하는
// node --test로 돌기 때문입니다.
import {
  ROOM_CODE_LENGTH,
  normalizeRoomCodeChar,
  normalizeRoomCodeText,
} from "../../matching/utils/roomCode.js"

const CODE_LENGTH = ROOM_CODE_LENGTH

/**
 * 입력 칸 하나에 그대로 얹는 정적 속성들입니다. 화면 파일(RoomCodeInput.jsx)이 아니라
 * 여기 있는 이유는 두 가지입니다 — 이 속성들이 정하는 건 모양이 아니라 "어떤 문자를
 * 받는가"라서 아래 정규화 규칙과 같은 곳에 있어야 서로 어긋나지 않고, .jsx는 이 훅의
 * 테스트를 돌리는 node --test가 읽지 못해 여기 있어야 단위 테스트로 고정할 수 있습니다.
 */
export const ROOM_CODE_INPUT_ATTRIBUTES = {
  type: "text",
  // 방코드는 숫자만이 아니라 영문자가 섞인 영숫자입니다(backend/utils/roomCode.js).
  // inputMode가 "numeric"이던 동안 모바일에서는 숫자 키패드만 떠서, 영문자가 든 코드는
  // 받아 놓고도 칠 방법이 없었습니다.
  inputMode: "text",
  // 한 칸은 한 글자를 담으므로 칸 단위 형식은 영숫자 한 글자입니다. 값은 아래
  // toRoomCodeCase로 항상 대문자가 되므로 소문자를 허용 집합에 넣지 않습니다.
  pattern: "[A-Z0-9]",
  autoComplete: "one-time-code",
  autoCorrect: "off",
  // 화면에 보이는 값이 늘 대문자이므로 키보드도 대문자로 열어 둡니다.
  autoCapitalize: "characters",
  spellCheck: false,
  maxLength: 1,
}

/**
 * 사용자가 만들어 낸 값의 대소문자를 서버 쪽에 맞춥니다.
 *
 * 서버는 대문자 집합에서만 방코드를 뽑고(backend/utils/roomCode.js) 비교는
 * `room.code === 입력값`이라 대소문자를 구분합니다. 그래서 소문자로 친 코드를 그대로
 * 보내면 멀쩡한 코드인데도 반드시 참가에 실패합니다.
 *
 * roomCode.js의 정규화가 케이스를 건드리지 않는 것은 서버가 준 값을 그대로 비춰야 하는
 * 표시 화면 때문입니다. 케이스를 맞추는 책임은 사용자가 값을 만드는 이 입력 쪽에 있습니다.
 */
const toRoomCodeCase = (text) => text.toUpperCase()

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
    return Array.from({ length: CODE_LENGTH }, (_, index) => value[index] ?? "")
  }

  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))

    // 한 칸을 입력하면 다음 칸으로 자동 이동합니다.
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
      // 자동완성/붙여넣기로 한 칸에 여러 글자가 들어오면 전체 방코드로 처리합니다.
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
