/**
 * 게임 모드 프레임 5종 공통 레이아웃
 * (싱글플레이·멀티플레이·비밀연회장·게임 만들기·게임 찾기)
 *
 * prototype 게임모드 선택창2.png 기준 — 이미지 크기·텍스트 슬롯 동일
 * 위치값은 MODE_CARD_*_INSET 한 곳에서만 수정
 */

/** ModeOptionCard 프레임 PNG 이미지 스타일 */
export const MODE_CARD_FRAME_IMAGE_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"

/** 카드 래퍼 — 프레임 max-width·오버레이 기준 박스 */
export const MODE_CARD_WRAP_CLASS =
  "relative mx-auto w-full max-w-[clamp(13rem,24vw,20.5rem)]"

/** 프레임 상단 모드명 슬롯 (% 기준, style prop) */
export const MODE_CARD_TITLE_INSET = {
  top: "8.5%",
  left: "6%",
  right: "6%",
}

/** 프레임 하단 설명 슬롯 — 일러스트·왁스 씰 아래 영역 */
export const MODE_CARD_DESCRIPTION_INSET = {
  top: "64.5%",
  left: "11%",
  right: "11%",
}

/** 제목 타이포 — 신라문화체 */
export const MODE_CARD_TITLE_CLASS =
  "pointer-events-none absolute z-[1] text-center font-display text-[clamp(1.75rem,2.85vw,2.3rem)] font-medium leading-none tracking-normal text-[#1a1008] antialiased"

/** 설명 타이포 — 나눔명조체 */
export const MODE_CARD_DESCRIPTION_CLASS =
  "pointer-events-none absolute z-[1] text-center font-subheading text-[clamp(0.82rem,1.15vw,0.98rem)] font-bold leading-[1.48] text-[#1a1008]"
