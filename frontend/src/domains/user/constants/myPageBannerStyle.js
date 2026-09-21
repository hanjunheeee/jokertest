// 로비/마이페이지 프로필 배너 — layout + style

export const LOBBY_TEXT_PANEL_INSET = {
  top: "20%",
  bottom: "17%",
  left: "34%",
  right: "5%",
}

export const LOBBY_BANNER_WIDTH_CLASS =
  "!w-[clamp(18rem,26vw,30rem)] max-w-full shrink-0"

/** 마이페이지 이동 버튼 프레임(칭호삭제).png — 구 프레임(440×91) 대비 시각 크기 맞춤 (393/440) */
export const MY_PAGE_BANNER_FRAME_IMAGE_CLASS =
  "block h-auto w-full select-none origin-left scale-[0.893]"

export const LOBBY_SETTINGS_GEAR_LAYOUT = {
  top: "14.5%",
  right: "17%",
  size: "7.8cqi",
}

export const LOBBY_BANNER_PROFILE_LAYOUT = {
  top: "-10%",
  left: "2.2%",
  width: "28%",
}

export const LOBBY_BANNER_PROFILE_PHOTO_INSET = {
  top: "13%",
  right: "18.5%",
  bottom: "18.5%",
  left: "18.5%",
}

export const MY_PAGE_BANNER_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)"

export const MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS = "left-[-4%]"

export const MY_PAGE_BANNER_LABEL_TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:4.4cqi] font-bold leading-tight text-[#ebe2cc]"

// F-30 AC-04/AC-06: 명성 문단 전용 글자 클래스(MY_PAGE_BANNER_REPUTATION_TEXT_CLASS)와
// 명성 구분선 전용 위치 상수(MY_PAGE_BANNER_TEXT_INSET_LEFT)는 BannerTextPanel이 단일
// 닉네임 영역이 되면서 소비처가 사라져 함께 제거했다. 배율(app-text-scaled·--app-text-size)
// ·초상·프레임·설정 버튼 위치 상수는 그대로다.

export const MY_PAGE_BANNER_ROOT_CLASS = "relative block [container-type:inline-size] leading-none"

export const MY_PAGE_BANNER_SETTINGS_BTN_CLASS = "group absolute z-10 cursor-pointer border-0 bg-transparent p-0 leading-none"
export const MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS = "interactive-scale-sm block h-full w-full select-none object-contain"

export const MY_PAGE_BANNER_PROFILE_WRAP_CLASS =
  "pointer-events-none absolute z-[2] aspect-square select-none"
export const MY_PAGE_BANNER_PROFILE_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"
export const MY_PAGE_BANNER_PROFILE_IMAGE_WRAP_CLASS =
  "absolute z-[1] overflow-hidden rounded-full"
export const MY_PAGE_BANNER_PROFILE_IMAGE_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

