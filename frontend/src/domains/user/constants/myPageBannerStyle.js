// 마이페이지 배너 버튼 className·자리 값 (글자 칸·톱니·초상)
// 배너 버튼 컴포넌트들·myPageAssets가 씀

// 이름 글자 칸 자리 (배너 틀 기준 %)
export const LOBBY_TEXT_PANEL_INSET = {
  top: "20%",
  bottom: "17%",
  left: "34%",
  right: "5%",
}

export const LOBBY_BANNER_WIDTH_CLASS =
  "!w-[clamp(18rem,26vw,30rem)] max-w-full shrink-0"

export const BANNER_FRAME_IMG_CLASS =
  "block h-auto w-full select-none origin-left scale-[0.893]"

// 톱니 버튼 자리·크기
export const LOBBY_SETTINGS_GEAR_LAYOUT = {
  top: "14.5%",
  right: "17%",
  size: "7.8cqi",
}

// 초상 자리·사진 안쪽 여백
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

// 이름 글자 모양
export const TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)"

export const TEXT_ALIGN_LEFT_CLASS = "left-[-4%]"

export const LABEL_TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:4.4cqi] font-bold leading-tight text-[#ebe2cc]"

// 배너·톱니·초상 className
export const ROOT_CLASS = "relative block [container-type:inline-size] leading-none"

export const SETTINGS_BTN_CLASS = "group absolute z-10 cursor-pointer border-0 bg-transparent p-0 leading-none"
export const SETTINGS_GEAR_IMG_CLASS = "interactive-scale-sm block h-full w-full select-none object-contain"

export const PROFILE_WRAP_CLASS =
  "pointer-events-none absolute z-[2] aspect-square select-none"
export const PROFILE_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"
export const PROFILE_IMG_WRAP_CLASS =
  "absolute z-[1] overflow-hidden rounded-full"
export const PROFILE_IMG_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

