/**
 * 방 코드 6자리 숫자 입력 UI (RoomCodeFrame 중앙 슬롯).
 *
 * 키보드 내비게이션·붙여넣기·포커스 이동 등 입력 제어는 useRoomCodeInput에 위임합니다.
 * 이 컴포넌트는 inputRefs를 6개 input에 연결하고 이벤트를 훅으로 전달하는 역할만 합니다.
 *
 * props
 * - value: 현재 방 코드 문자열 (0~6자, 숫자만)
 * - onChange: 값 변경 시 부모 state 갱신
 * - readOnly: 읽기 전용 표시 (모달 방코드 보기)
 * - disabled: 입력 비활성화
 * - autoFocus: true면 입장 애니메이션 직후 첫 칸에 포커스 (훅 내부에서 280ms 지연)
 */
import { useRoomCodeInput } from "../hooks/useRoomCodeInput.js"

export default function RoomCodeInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  autoFocus = false,
}) {
  const { inputRefs, getChars, handleChange, handleKeyDown, handlePaste } =
    useRoomCodeInput({ value, onChange, autoFocus, disabled, readOnly })

  const chars = getChars() // value 문자열을 6개 칸 배열로 분해

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
            inputRefs.current[index] = el // 훅이 포커스 이동에 사용하는 ref 배열에 등록
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
          onFocus={(event) => event.target.select()} // 포커스 시 기존 값 전체 선택 — 덮어쓰기 UX
          className="box-border aspect-square h-[92%] w-[13%] max-w-[2.95rem] min-w-[2rem] shrink-0 cursor-text border-0 bg-transparent p-0 text-center font-subheading text-[clamp(1.4rem,2.55vw,2.3rem)] font-bold leading-none tracking-normal text-[#f5f0e6] outline-none caret-[#e8c878] placeholder:text-white/25 focus:ring-2 focus:ring-[#c4a574]/70 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
        />
      ))}
    </div>
  )
}
