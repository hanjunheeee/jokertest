// 모바일 로비 메뉴 한 칸·글자 (패널 비율 맞춤, 세로 줄면 vw·rem보다 svh·dvh가 먼저 줄어듦)
const MENU_BTN_WIDTH =
  "w-[clamp(5.25rem,min(44vw,10.75rem,21svh,21dvh),10.75rem)] land:w-[clamp(4.5rem,min(26vw,7.25rem,15.5svh,15.5dvh),7.25rem)]"

const MENU_NAV_MAX_W =
  "max-w-[clamp(5.25rem,min(44vw,10.75rem,21svh,21dvh),10.75rem)] land:max-w-[min(62vw,16.5rem)]"

export const LOBBY_MOBILE_MENU_BTN_CLASS =
  `interactive-scale group relative mx-auto flex shrink-0 items-center justify-center border-0 bg-transparent p-0 leading-none ${MENU_BTN_WIDTH}`

export const LOBBY_MOBILE_MENU_PANEL_IMG_CLASS = "block h-auto w-full select-none object-contain"

export const LOBBY_MOBILE_MENU_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[12%] font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,min(4.2vw,2.35svh,2.35dvh),1.2rem)] font-bold leading-tight tracking-tight text-[#f3ddb0] [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_12px_rgba(80,20,10,0.35)] land:[--app-text-size:clamp(0.75rem,min(2.4vw,1.85svh,1.85dvh),1rem)]"

export const LOBBY_MOBILE_MENU_LABEL_ACTIVE_CLASS =
  "text-[#fff2c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_14px_rgba(255,160,60,0.25)]"

export const LOBBY_MOBILE_MENU_NAV_CLASS =
  `flex w-full ${MENU_NAV_MAX_W} flex-col items-stretch gap-[clamp(0.15rem,min(0.9svh,0.9dvh),0.4rem)] land:grid land:grid-cols-2 land:gap-x-2 land:gap-y-1`
