// 방코드 입력 틀: 데스크톱 양피지 틀 그림 위에 6칸 글자 표시 + 칸 줄 전체를 덮는 투명 입력칸 하나
// RoomInvitePage가 씀, 입력칸 하나라 폰 키보드로 이어 치기·붙여넣기·지우기가 그대로 됨, footer는 데스크톱처럼 틀 아래 버튼 줄
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import { FOOTER_INSET, IMG_CLASS, INPUT_INSET } from "@/domains/game/shared/constants/roomCodeFrameStyles.js"
import { ROOM_CODE_LENGTH } from "@/domains/game/shared/utils/roomCode.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useCodeField } from "@m/domains/game/mode/hooks/useCodeField.js"

// 버튼 칸이 44px 이상이라 폰 폭에선 칸 줄과 닿음 → 아래 여백만 데스크톱(7.5%)보다 줄임
const FOOTER_STYLE = { ...FOOTER_INSET, paddingBottom: "4.5%" }

// 방 코드 입력 틀
export default function CodeFrame({ value, onChange, onSubmit, autoFocus = false, footer = null }) {
  const { inputRef, focused, handleChange, handleKeyDown, handleFocus, handleBlur } =
    useCodeField({ onChange, onSubmit, autoFocus })
  const chars = Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => value[index] ?? "")
  // 다음에 칠 칸 (다 찼으면 마지막 칸)
  const activeIndex = Math.min(value.length, ROOM_CODE_LENGTH - 1)

  return (
    <div className="relative w-full">
      <PublicAsset
        src={ROOM_INVITE_ASSETS.inputFrame}
        alt="방코드 입력"
        className={IMG_CLASS}
      />

      <div className="absolute z-10" style={INPUT_INSET}>
        {/* 그림 칸 자리에 맞춘 글자 6칸 (데스크톱 RoomCodeInput과 같은 여백) */}
        <div className="pointer-events-none flex h-full w-full items-center justify-between pl-[8.6%] pr-[7.8%]" aria-hidden="true">
          {chars.map((char, index) => (
            <span
              key={index}
              className={`flex aspect-square h-[92%] w-[13%] items-center justify-center rounded-[2px] font-subheading text-[min(6vw,1.9rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.95)] ${
                focused && index === activeIndex ? "ring-2 ring-[#c4a574]/70" : ""
              }`}
            >
              {char}
            </span>
          ))}
        </div>

        {/* 실제 입력칸: 글자·커서는 숨기고, 누르는 자리는 위아래로 늘려 44px 이상 */}
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          pattern="[A-Za-z0-9]*"
          aria-label="방 코드 6자리"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="absolute inset-x-0 top-1/2 h-[max(100%,2.75rem)] w-full -translate-y-1/2 cursor-text border-0 bg-transparent p-0 text-transparent caret-transparent opacity-[0.01] outline-none selection:bg-transparent"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end" style={FOOTER_STYLE}>
        {footer}
      </div>
    </div>
  )
}
