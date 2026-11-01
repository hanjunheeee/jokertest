// 재판 연출 채팅 글자·입력칸·보내기 버튼 모양
// 채팅 레이아웃 상수(ingameChatLayout.js)가 재판 종류일 때 고름

// 글자 모양 (설정 배율 반영판 포함)
export const TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_CLASS =
  "font-subheading text-[clamp(0.68rem,2.75cqi,0.86rem)] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

export const TRIBUNAL_CHAT_TEXT_TYPOGRAPHY_SCALED_CLASS =
  "font-subheading text-[clamp(calc(0.68rem*var(--ingame-chat-text-scale,1)),calc(2.75cqi*var(--ingame-chat-text-scale,1)),calc(0.86rem*var(--ingame-chat-text-scale,1)))] font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

export const TRIBUNAL_CHAT_TEXT_SCALED_FONT_SIZE =
  "clamp(calc(0.68rem*var(--ingame-chat-text-scale,1)),calc(2.75cqi*var(--ingame-chat-text-scale,1)),calc(0.86rem*var(--ingame-chat-text-scale,1)))"

// 입력 높이·여백·왼쪽 띄움
export const TRIBUNAL_CHAT_INPUT_SINGLE_LINE_HEIGHT_CLASS =
  "max-h-[clamp(0.95rem,4.1cqi,1.15rem)]"

export const TRIBUNAL_CHAT_INPUT_VIEWPORT_FIXED_HEIGHT_CLASS =
  "h-[clamp(2rem,7.2cqi,2.5rem)]"

export const TRIBUNAL_CHAT_TEXT_WRAP_TRIM_CLASS =
  "pl-[clamp(0.3rem,1.2cqi,0.5rem)] pr-[clamp(0.9rem,3.8cqi,1.6rem)]"

export const TRIBUNAL_CHAT_INPUT_SHIFT_CLASS =
  "ml-[clamp(1.6rem,8cqi,2.6rem)]"

// 보내기 버튼
export const TRIBUNAL_CHAT_SEND_BTN_CLASS =
  "interactive-scale relative block w-[clamp(3.5rem,20cqi,4.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

export const TRIBUNAL_CHAT_SEND_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.68rem,3.1cqi,0.82rem)] font-bold text-[#e9b582] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const TRIBUNAL_CHAT_SEND_BTN_SHIFT_CLASS =
  "-translate-x-[clamp(1rem,5.2cqi,1.55rem)]"
