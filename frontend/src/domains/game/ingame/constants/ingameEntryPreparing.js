// 역할 공개(ROLE_REVEAL) 동안 입장 대기 연출 문구·모양
// InGameEntryPreparingOverlay·조작 잠금 선택 함수가 사용

export const INGAME_ENTRY_PREPARING_MESSAGE = "가면무도회에 입장하는 중입니다."

export const INGAME_ENTRY_PREPARING_BACKDROP_CLASS =
  "pointer-events-auto fixed inset-0 z-[52] flex items-center justify-center bg-black/45"

export const INGAME_ENTRY_PREPARING_MESSAGE_CLASS =
  "pointer-events-none max-w-[96vw] shrink-0 whitespace-nowrap px-3 text-center font-display app-text-scaled [--app-text-size:clamp(1.1rem,3.6vw,2.75rem)] font-medium leading-snug tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_2px_14px_rgba(0,0,0,0.88)]"