import { useEffect, useRef } from "react"

const CODE_LENGTH = 6

/** 한 칸에 들어갈 숫자 1자만 남김 */
function sanitizeChar(char) {
  return char.replace(/\D/g, "").slice(-1)
}

/** 붙여넣기·다칸 입력을 6자리 숫자 문자열로 정리 */
function sanitizeCode(text) {
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH)
}

/**
 * 방 코드 6칸 분리 입력 제어 훅.
 *
 * - 단일 문자 입력: 해당 칸 업데이트 후 다음 칸으로 포커스 이동
 * - 다중 문자 입력 (붙여넣기·자동완성): raw.length > 1 로 감지해 전체 코드로 반영
 * - Backspace: 현재 칸이 비어 있으면 이전 칸 삭제 후 이동
 * - ArrowLeft/Right: 칸 간 포커스 이동
 * - autoFocus 시 280ms 지연: 입장 연출 애니메이션이 끝난 뒤 포커스를 맞추기 위함
 *
 * @param {{ value, onChange, autoFocus, disabled, readOnly }} props
 */
export function useRoomCodeInput({ value, onChange, autoFocus, disabled, readOnly }) {
  const inputRefs = useRef([]) // 6개 input 엘리먼트를 배열로 참조

  /** index번째 input에 포커스 후 전체 선택 */
  const focusIndex = (index) => {
    const el = inputRefs.current[index]
    if (el) {
      el.focus()
      el.select()
    }
  }

  // 입장 연출 직후 첫 칸에 포커스 — 애니메이션 종료 전 포커스 시 UX 이상으로 280ms 지연
  useEffect(() => {
    if (!autoFocus || disabled || readOnly) return
    const timer = window.setTimeout(() => focusIndex(0), 280)
    return () => window.clearTimeout(timer)
  }, [autoFocus, disabled, readOnly])

  /** value 문자열을 6개 문자 배열로 분해 (빈 칸은 "") */
  const getChars = () =>
    Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "")

  /** 특정 칸의 값을 nextChar로 교체하고, 숫자가 입력됐으면 다음 칸으로 이동 */
  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))
    if (nextChar && index < CODE_LENGTH - 1) {
      focusIndex(index + 1) // 숫자 입력 완료 → 자동으로 다음 칸 이동
    }
  }

  /**
   * onChange 핸들러.
   * raw.length > 1 이면 붙여넣기·자동완성으로 간주하고 전체 코드로 반영합니다.
   */
  const handleChange = (index, event) => {
    const raw = event.target.value
    if (!raw) {
      updateAt(index, "") // 칸 비우기
      return
    }
    const cleaned = sanitizeChar(raw)
    if (!cleaned) return // 숫자 외 문자는 무시

    if (raw.length > 1) {
      // 붙여넣기·자동완성: 전체 코드로 한 번에 채운 뒤 마지막 입력 칸으로 포커스
      const pasted = sanitizeCode(raw)
      onChange(pasted)
      focusIndex(Math.min(pasted.length, CODE_LENGTH - 1))
      return
    }

    updateAt(index, cleaned)
  }

  /**
   * onKeyDown 핸들러.
   * Backspace는 현재 칸 값 유무에 따라 분기:
   *   - 값 있음 → 현재 칸만 삭제
   *   - 값 없음 → 이전 칸 삭제 후 포커스 이동
   */
  const handleKeyDown = (index, event) => {
    const chars = getChars()

    if (event.key === "Backspace") {
      event.preventDefault()
      if (chars[index]) {
        updateAt(index, "") // 현재 칸에 값 있음 → 여기만 삭제
        return
      }
      if (index > 0) {
        updateAt(index - 1, "") // 빈 칸 → 이전 칸 삭제 후 포커스 이동
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

  /** onPaste 핸들러 — 클립보드 텍스트에서 숫자만 추출해 코드 전체에 반영 */
  const handlePaste = (event) => {
    event.preventDefault()
    const pasted = sanitizeCode(event.clipboardData.getData("text"))
    onChange(pasted)
    // 붙여넣기된 길이-1 칸으로 포커스, 6칸 초과는 마지막(5번째 인덱스)으로 클램프
    focusIndex(Math.min(Math.max(pasted.length - 1, 0), CODE_LENGTH - 1))
  }

  return { inputRefs, getChars, handleChange, handleKeyDown, handlePaste }
}
