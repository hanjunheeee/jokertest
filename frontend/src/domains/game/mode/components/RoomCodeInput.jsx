// 파일 역할: RoomCodeInput.jsx - 화면을 구성하는 컴포넌트입니다.
import { useRoomCodeInput } from "@/domains/game/mode/hooks/useRoomCodeInput.js"

// 방코드 6자리를 한 칸씩 입력하는 UI입니다.
export default function RoomCodeInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  autoFocus = false,
}) {
  const { inputRefs, getChars, handleChange, handleKeyDown, handlePaste } =
    useRoomCodeInput({ value, onChange, autoFocus, disabled, readOnly })

  const chars = getChars()

  return (
    <div className="flex h-full w-full items-center justify-between pl-[8.6%] pr-[7.8%]" role="group" aria-label="방 코드 6자리">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el }}
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
