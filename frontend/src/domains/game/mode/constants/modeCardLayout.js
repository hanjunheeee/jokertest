// 모드 카드 프레임 이미지 공통 스타일입니다.
export const MODE_CARD_FRAME_IMAGE_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"

// 모드 카드 전체 크기와 기준 좌표를 잡는 wrapper입니다.
export const MODE_CARD_WRAP_CLASS =
  "relative mx-auto w-full max-w-[clamp(13rem,24vw,20.5rem)]"

// 카드 프레임 안에서 제목이 들어갈 위치입니다.
export const MODE_CARD_TITLE_INSET = { top: "8.5%", left: "6%", right: "6%" }

// 카드 프레임 안에서 설명 문구가 들어갈 위치입니다.
export const MODE_CARD_DESCRIPTION_INSET = { top: "64.5%", left: "11%", right: "11%" }

// 카드 제목 텍스트 스타일입니다.
export const MODE_CARD_TITLE_CLASS =
  "pointer-events-none absolute z-[1] text-center font-display text-[clamp(calc(1.75rem+4pt),calc(2.85vw+4pt),calc(2.3rem+4pt))] font-medium leading-none tracking-normal text-[#1a1008] antialiased"

// 카드 설명 문구 텍스트 스타일입니다.
export const MODE_CARD_DESCRIPTION_CLASS =
  "pointer-events-none absolute z-[1] text-center font-subheading text-[clamp(calc(0.82rem+2pt),calc(1.15vw+2pt),calc(0.98rem+2pt))] font-bold leading-[1.48] text-[#1a1008]"
