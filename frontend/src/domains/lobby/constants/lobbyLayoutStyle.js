// 로비 페이지 전체 배경 박스입니다.
export const LOBBY_PAGE_ROOT_CLASS = "relative h-svh w-full overflow-hidden bg-black"

// 인트로가 끝난 뒤 나타나는 로비 UI 전체 레이어입니다.
export const LOBBY_UI_LAYER_CLASS = "absolute inset-0 z-10"

// 왼쪽 로고와 메뉴가 들어가는 영역입니다.
export const LOBBY_SIDE_MENU_CLASS = "absolute left-[7.5%] top-[6%] flex flex-col items-center sm:left-[8%] sm:top-[6.5%]"
export const LOBBY_LOGO_CLASS = "pointer-events-none h-auto w-[clamp(11.2rem,21.6vw,22.4rem)] translate-y-[clamp(0.4rem,1.2vh,0.9rem)] select-none"

// 오른쪽 위 마이페이지 배너가 들어가는 영역입니다.
export const LOBBY_PROFILE_SHORTCUT_CLASS = "absolute top-[2.5%] right-[0.5%] z-10 flex flex-col items-stretch gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:top-[3%] sm:right-[1%]"

// 오른쪽 아래 디스코드·친구 목록 버튼과 사운드 조절 UI가 들어가는 영역입니다.
export const LOBBY_RIGHT_CONTROLS_CLASS = "absolute bottom-4 right-4 z-10 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6"

export const LOBBY_RIGHT_ACTIONS_ROW_CLASS =
  "flex items-end gap-[clamp(0.5rem,1vw,0.75rem)]"

/** 로비 우하단 액션 버튼(디스코드·친구목록) 공통 hover — interactive-scale */
export const LOBBY_RIGHT_ACTION_BTN_CLASS =
  "interactive-scale group block shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const LOBBY_DISCORD_BTN_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} aspect-square w-[clamp(5.5rem,8.2vw,7.1rem)] translate-x-[clamp(1.5rem,2.4vw,2.7rem)] -translate-y-[clamp(0.3rem,0.9vh,0.3rem)] overflow-hidden rounded-sm`

export const LOBBY_FRIEND_LIST_BTN_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} w-[clamp(5.25rem,8.5vw,7.25rem)]`

export const LOBBY_DISCORD_BTN_IMG_CLASS =
  "block h-full w-full select-none object-cover object-center"

export const LOBBY_FRIEND_LIST_BTN_IMG_CLASS = "block h-auto w-full select-none"

// 기존 이름을 쓰는 컴포넌트가 있어도 깨지지 않도록 같은 값을 유지합니다.
export const LOBBY_SOUND_CONTROL_CLASS = LOBBY_RIGHT_CONTROLS_CLASS

// 인트로가 아직 끝나지 않았을 때 전체 화면을 덮는 스킵 버튼입니다.
export const LOBBY_INTRO_SKIP_LAYER_CLASS = "absolute inset-0 z-20 cursor-pointer border-0 bg-transparent p-0"

// 로비 배경 영상에 들어가는 class입니다.
export const LOBBY_BG_VIDEO_CLASS = "absolute inset-0 h-full w-full object-cover object-center"
