/**
 * 방 코드 6자리 숫자 입력 UI (RoomCodeFrame 중앙 슬롯)
 *
 * props
 * - value: 현재 방 코드 문자열 (0~6자, 숫자만)
 * - onChange: 값 변경 시 부모 state 갱신
 * - readOnly: 읽기 전용 표시 (모달 방코드 보기)
 * - disabled: 입력 비활성화
 * - autoFocus: true면 마운트 후 첫 칸에 포커스
 */
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

/** 6칸 분리 입력·붙여넣기·백스페이스 포커스 이동을 처리하는 방코드 입력 */
export default function RoomCodeInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  autoFocus = false,
}) {
  const inputRefs = useRef([])

  // 입장 연출 직후 첫 칸에 포커스
  useEffect(() => {
    if (!autoFocus || disabled || readOnly) return // 포커스 불필요·입력 불가면 스킵
    const timer = window.setTimeout(() => focusIndex(0), 280)
    return () => window.clearTimeout(timer)
  }, [autoFocus, disabled, readOnly])

  const getChars = () =>
    Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "")

  /** index번째 input에 포커스·전체 선택 */
  const focusIndex = (index) => {
    const el = inputRefs.current[index]
    if (el) { // ref가 붙은 input만 포커스
      el.focus()
      el.select()
    }
  }

  /** 한 칸 값을 바꾸고, 숫자 입력 시 다음 칸으로 포커스 이동 */
  const updateAt = (index, nextChar) => {
    const next = getChars()
    next[index] = nextChar
    onChange(next.join(""))
    if (nextChar && index < CODE_LENGTH - 1) { // 숫자 입력 후 다음 칸으로 이동
      focusIndex(index + 1)
    }
  }

  /** 칸별 입력·다칸 붙여넣기 처리 — 숫자 외 문자는 무시 */
  const handleChange = (index, event) => {
    const raw = event.target.value
    if (!raw) { // 칸 비우기(삭제)
      updateAt(index, "")
      return
    }

    const cleaned = sanitizeChar(raw)
    if (!cleaned) return // 숫자가 아니면 무시

    if (raw.length > 1) { // 한 번에 여러 글자(붙여넣기·자동완성) → 전체 코드로 반영
      const pasted = sanitizeCode(raw)
      onChange(pasted)
      focusIndex(Math.min(pasted.length, CODE_LENGTH - 1)) // 마지막 입력 칸 또는 6번째 칸
      return
    }

    updateAt(index, cleaned)
  }

  /** Backspace 시 이전 칸 삭제·이동, 좌우 화살표로 칸 이동 */
  const handleKeyDown = (index, event) => {
    const chars = getChars()

    if (event.key === "Backspace") { // 현재 칸 지우기, 비어 있으면 이전 칸으로
      event.preventDefault()
      if (chars[index]) { // 이 칸에 값 있음 → 여기만 삭제
        updateAt(index, "")
        return
      }
      if (index > 0) { // 빈 칸에서 Backspace → 이전 칸 삭제 후 포커스
        updateAt(index - 1, "")
        focusIndex(index - 1)
      }
      return
    }

    if (event.key === "ArrowLeft" && index > 0) { // 왼쪽 방향키 누르면 왼쪽 칸으로
      event.preventDefault()
      focusIndex(index - 1)
      return
    }

    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) { // 오른쪽 방향키 누르면 오른쪽 칸으로
      event.preventDefault()
      focusIndex(index + 1)
    }
  }

  /** 클립보드에서 6자리 숫자만 추출해 한 번에 채움 */
  const handlePaste = (event) => {
    event.preventDefault()
    const pasted = sanitizeCode(event.clipboardData.getData("text"))
    onChange(pasted)
    focusIndex(Math.min(Math.max(pasted.length - 1, 0), CODE_LENGTH - 1))
  }

  const chars = getChars()

  return (
    <div
      className="flex h-full w-full items-center justify-between pl-[8.6%] pr-[7.8%]"
      role="group"
      aria-label="방 코드 6자리"
    >
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={1}
          value={char}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={`방 코드 ${index + 1}번째 자리`}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className="box-border aspect-square h-[92%] w-[13%] max-w-[2.95rem] min-w-[2rem] shrink-0 cursor-text border-0 bg-transparent p-0 text-center font-subheading text-[clamp(1.4rem,2.55vw,2.3rem)] font-bold leading-none tracking-normal text-[#f5f0e6] outline-none caret-[#e8c878] placeholder:text-white/25 focus:ring-2 focus:ring-[#c4a574]/70 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
        />
      ))}
    </div>
  )
}
