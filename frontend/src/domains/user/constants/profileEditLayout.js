// 프로필 편집 창 className·움직임과 프로필 사진·테두리 아이템 id → 그림 경로
// 프로필 편집 창 컴포넌트들·편집 훅·프로필 꾸미기 스토어·시험이 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../shared/constants/customScrollbarStyles.js"

// 창 열고 닫는 움직임·배경·틀
export const PROFILE_EDIT_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center p-[clamp(1rem,3vw,2rem)]"

export const PANEL_CLASS =
  "pointer-events-auto relative flex w-[min(36rem,92vw)] max-w-[42rem] flex-col overflow-hidden rounded-[1.1rem] border border-[#b83232]/40 bg-[#f5f0e6]/84 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_16px_42px_rgba(26,15,10,0.36)]"

export const HEADER_CLASS =
  "border-b border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.65rem,1.2vh,0.85rem)]"

// 위쪽 탭
export const PROFILE_EDIT_TABS_CLASS =
  "flex items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const TAB_BTN_CLASS =
  "relative w-[clamp(7.5rem,22vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const TAB_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const TAB_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const TAB_BTN_LABEL_INACTIVE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#5c554d] [text-shadow:0_1px_1px_rgba(245,240,230,0.35)]"

// 미리보기
export const PREVIEW_SECTION_CLASS =
  "flex items-center justify-center border-b border-[#2a1810]/12 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.85rem,1.8vh,1.15rem)]"

export const PREVIEW_WRAP_CLASS =
  "relative aspect-square w-[clamp(6.5rem,18vw,9.5rem)] select-none"

export const PREVIEW_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const PREVIEW_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

export const PREVIEW_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

// 보유 목록 칸
export const GRID_SECTION_CLASS =
  `min-h-[min(10rem,28vh)] max-h-[min(16rem,38vh)] overflow-y-auto overscroll-contain px-[clamp(0.75rem,1.35vw,1rem)] py-[clamp(0.65rem,1.2vh,0.85rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const PROFILE_EDIT_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(clamp(3.75rem,11vw,4.75rem),1fr))] gap-[clamp(0.45rem,0.85vw,0.65rem)]"

export const OPTION_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0"

export const OPTION_CARD_CLASS =
  "flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-[#2a1810]/14 bg-[#1a0f0a]/06 transition-[box-shadow,ring-color] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12),_0_4px_14px_rgba(0,0,0,0.12)]"

export const OPTION_CARD_SELECTED_CLASS =
  "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.16),_0_4px_14px_rgba(0,0,0,0.16),_0_0_16px_rgba(180,40,40,0.38),_0_0_6px_rgba(220,50,50,0.28)]"

export const OPTION_PHOTO_WRAP_CLASS =
  "flex h-[82%] w-[82%] items-center justify-center overflow-hidden rounded-full"

export const OPTION_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.22] select-none object-cover object-center"

export const OPTION_BORDER_CLASS =
  "block h-[88%] w-[88%] select-none object-contain object-center"

// 확인·닫기 버튼
export const FOOTER_CLASS =
  "border-t border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.75rem,1.35vh,1rem)]"

export const CONFIRM_BTN_CLASS =
  "relative mx-auto block w-[min(100%,14rem)] cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const CONFIRM_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.35rem,2%,0.65rem)] top-[clamp(0.45rem,2.2%,0.65rem)] z-20 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.1rem,3.8vw,2.65rem)] select-none"

// 그림 폴더 (테두리 폴더 이름의 빈칸은 실제 public 폴더 이름 그대로)
const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"

const PHOTO_ITEM_ID_PREFIX = "player-profile-"

// 사진 이름 (보여 줄 순서)
const PHOTO_NAMES_IN_DISPLAY_ORDER = [
  "금빛가면", "마인", "사냥꾼", "기사", "붉은기운", "악당", "영애", "수녀",
  "영주", "화관쓴소녀", "암살자", "역병의사", "그림자", "음유시인", "드워프", "귀부인",
]

const photoAssetSrcForName = (name) => `${PROFILE_PHOTO_BASE}프로필-${name}.png`.normalize("NFD")

// 무료 사진 그림 목록 (지금 아무도 안 씀)
export const FREE_PHOTOS = PHOTO_NAMES_IN_DISPLAY_ORDER.map(photoAssetSrcForName)

// 기본 사진·사진 아이템 종류
export const DEFAULT_PROFILE_PHOTO_ITEM_ID = `${PHOTO_ITEM_ID_PREFIX}금빛가면`

export const PROFILE_PHOTO_ITEM_TYPE = "PROFILE_PHOTO"

// 사진 아이템 id → 그림 경로 (접두어가 다르거나 이름이 비면 null)
export const photoAssetSrcForItemId = (itemId) => {
  if (typeof itemId !== "string" || !itemId.startsWith(PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return photoAssetSrcForName(name)
}

// 사진 고르기 칸 목록 (지금은 시험만 씀)
export const PROFILE_EDIT_PHOTO_OPTIONS = PHOTO_NAMES_IN_DISPLAY_ORDER.map((name) => ({
  itemId: `${PHOTO_ITEM_ID_PREFIX}${name}`,
  src: photoAssetSrcForName(name),
}))

// 테두리 id 접두어·기본 테두리·아이템 종류
const BORDER_ITEM_ID_PREFIX = "profile-border-"

export const DEFAULT_PROFILE_BORDER_ITEM_ID = `${BORDER_ITEM_ID_PREFIX}평민`

export const BORDER_ITEM_TYPE = "PROFILE_BORDER"

// 테두리 아이템 id → 그림 경로 (접두어가 다르거나 등급이 비면 null)
export const borderAssetSrcForItemId = (itemId) => {
  if (typeof itemId !== "string" || !itemId.startsWith(BORDER_ITEM_ID_PREFIX)) return null
  const tier = itemId.slice(BORDER_ITEM_ID_PREFIX.length)
  if (!tier) return null
  return `${PROFILE_BORDER_BASE}프로필프레임-${tier}.png`.normalize("NFD")
}

// 탭 id·이름
export const PROFILE_EDIT_TAB_PHOTO = "photo"
export const PROFILE_EDIT_TAB_BORDER = "border"

export const PROFILE_EDIT_TABS = [
  { id: PROFILE_EDIT_TAB_PHOTO, label: "프로필 수정" },
  { id: PROFILE_EDIT_TAB_BORDER, label: "테두리 수정" },
]

// 목록 상태 글자·다시 시도·오류 글자
export const GRID_STATUS_TEXT_CLASS =
  "flex flex-col items-center gap-[0.5rem] px-[0.5rem] py-[1rem] text-center font-body app-text-scaled [--app-text-size:0.85rem] text-[#5c554d]"

export const GRID_RETRY_BTN_CLASS =
  "cursor-pointer rounded-md border border-[#b83232]/40 bg-transparent px-[0.75rem] py-[0.3rem] font-body app-text-scaled [--app-text-size:0.82rem] text-[#b83232] transition-opacity hover:opacity-80"

export const ERROR_TEXT_CLASS =
  "px-[clamp(0.85rem,1.5vw,1.15rem)] pb-[0.35rem] text-center font-body app-text-scaled [--app-text-size:0.8rem] text-[#b83232]"
