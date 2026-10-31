export const LOBBY_PAGE_ROOT_CLASS = "relative h-svh w-full overflow-hidden bg-black"

export const LOBBY_UI_LAYER_CLASS = "absolute inset-0 z-10"

export const LOBBY_SIDE_MENU_CLASS = "absolute left-[7.5%] top-[6%] flex flex-col items-center sm:left-[8%] sm:top-[6.5%]"
export const LOBBY_LOGO_CLASS = "pointer-events-none h-auto w-[clamp(11.2rem,21.6vw,22.4rem)] translate-y-[clamp(0.4rem,1.2vh,0.9rem)] select-none"

export const LOBBY_PROFILE_SHORTCUT_CLASS =
  "absolute top-[2.5%] right-0 z-10 flex translate-x-[clamp(1rem,1.85vw,1.38rem)] flex-col items-stretch gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:top-[3%] sm:translate-x-[clamp(1.15rem,2.05vw,1.52rem)]"

export const LOBBY_LEFT_CONTROLS_CLASS = "absolute bottom-4 left-4 z-10 sm:bottom-6 sm:left-6"

export const LOBBY_RIGHT_CONTROLS_CLASS = "absolute bottom-4 right-4 z-10 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6"

export const LOBBY_RIGHT_ACTIONS_ROW_CLASS =
  "flex items-end gap-[clamp(0.5rem,1vw,0.75rem)]"

export const LOBBY_RIGHT_ACTION_BTN_CLASS =
  "interactive-scale group block shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const LOBBY_DISCORD_BTN_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} aspect-square w-[clamp(5.5rem,8.2vw,7.1rem)] translate-x-[clamp(1.5rem,2.4vw,2.7rem)] -translate-y-[clamp(0.3rem,0.9vh,0.3rem)] overflow-hidden rounded-sm`

export const LOBBY_FRIEND_LIST_BTN_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} mr-[clamp(1rem,1.75vw,1.35rem)] w-[clamp(2.85rem,4.5vw,3.75rem)]`

export const LOBBY_NOTIFICATION_ENTRY_BTN_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} relative w-[clamp(3.35rem,5.75vw,4.5rem)]`

export const LOBBY_NOTIFICATION_ENTRY_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const LOBBY_NOTIFICATION_ENTRY_BADGE_CLASS =
  "absolute -right-2 -top-0.5 inline-flex min-w-[1.65em] items-center justify-center rounded-full bg-[#8a2b12] px-[0.35em] py-[0.08em] font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,1.25vw,0.88rem)] font-bold leading-tight text-white"

export const LOBBY_DISCORD_BTN_IMG_CLASS =
  "block h-full w-full select-none object-cover object-center"

export const LOBBY_FRIEND_LIST_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const LOBBY_SOUND_CONTROL_CLASS = LOBBY_RIGHT_CONTROLS_CLASS

export const LOBBY_INTRO_SKIP_LAYER_CLASS = "absolute inset-0 z-20 cursor-pointer border-0 bg-transparent p-0"

export const LOBBY_BG_IMAGE_CLASS = "absolute inset-0 h-full w-full object-cover object-center"

export const LOBBY_BG_VIDEO_CLASS =
  "absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-500"

export const LOBBY_BG_VIDEO_HIDDEN_CLASS = "pointer-events-none opacity-0"
