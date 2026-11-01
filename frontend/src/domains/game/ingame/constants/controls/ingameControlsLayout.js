// 왼쪽 위 버튼 줄 모양: 자리·버튼·그림 크기
// 왼쪽 위 버튼 줄(InGameTopControls)이 사용

// 버튼 줄 자리 (왼쪽 위 고정)
export const TOP_CONTROLS_POSITION_CLASS =
  "absolute top-[clamp(0.45rem,1.8vh,1.1rem)] left-[clamp(0.45rem,1.4cqw,0.9rem)] z-10 flex items-center gap-[clamp(0.3rem,1cqw,0.55rem)]"

// 버튼과 그림 (내 역할 보기 그림은 조금 작게)
export const BTN_CLASS =
  "group shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.45rem,5.2cqw,3.2rem)] select-none transition-transform duration-200 ease-out group-hover:scale-[1.08] group-active:scale-[0.95]"

export const ROLE_REVEAL_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.1rem,4.6cqw,2.85rem)] select-none transition-transform duration-200 ease-out group-hover:scale-[1.08] group-active:scale-[0.95]"
