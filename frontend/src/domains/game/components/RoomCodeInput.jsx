import { useEffect, useRef } from "react"

const CODE_LENGTH = 6

function sanitizeChar(char) {
  return char.replace(/\D/g, "").slice(-1)
}

function sanitizeCode(text) {
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH)
}

/**
 * prototype 방코드 입력 프레임.png — 프레임 PNG에 그려진 6칸 위에 텍스트 입력
 */
export default function RoomCodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
}) {
  const inputRefs = useRef([])

  useEffect(() => {
    if (!autoFocus || disabled) return
    const timer = window.setTimeout(() => focusIndex(0), 280)
    return () => window.clearTimeout(timer)
  }, [autoFocus, disabled])

  const getChars = () =>
    Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "")

  const focusIndex = (index) => {
    const el = inputRefs.current[index]
    if (el) {
      el.focus()
      el.select()
    }
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

    const cleaned = sanitizeChar(raw)
    if (!cleaned) return

    if (raw.length > 1) {
      const pasted = sanitizeCode(raw)
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
