// 로비 메뉴 전체 위치와 간격입니다.
export const LOBBY_MENU_NAV_CLASS = "mt-[clamp(1.25rem,3.5vh,2.5rem)] flex translate-x-[clamp(0.1rem,1.0vw,-0.1rem)] translate-y-[clamp(1.25rem,3.5vh,2.75rem)] flex-col items-center gap-[clamp(0.85rem,2.2vh,1.35rem)]"

// 로비 메뉴 버튼과 이미지에 들어가는 공통 스타일입니다.
export const LOBBY_MENU_BTN_CLASS = "interactive-scale lobby-menu-btn block leading-none"

// 고객센터 + 디스코드를 하나의 로비 메뉴 버튼으로 묶을 때 쓰는 스타일입니다.
export const LOBBY_MENU_CUSTOMER_BTN_CLASS =
  `${LOBBY_MENU_BTN_CLASS} flex items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]`

export const LOBBY_MENU_IMG_CLASS = "lobby-menu-btn__img block h-[clamp(3.18rem,5.9vh,4.6rem)] w-auto max-w-[clamp(11.9rem,21.85vw,19rem)] select-none object-contain object-center"

export const LOBBY_MENU_DISCORD_IMG_CLASS =
  "lobby-menu-btn__img block aspect-square h-[clamp(2.85rem,5.2vh,4rem)] w-[clamp(2rem,6.2vh,3rem)] shrink-0 select-none object-cover object-center"