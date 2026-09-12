import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../shared/constants/customScrollbarStyles.js"

export const PROFILE_EDIT_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const PROFILE_EDIT_BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PROFILE_EDIT_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center p-[clamp(1rem,3vw,2rem)]"

export const PROFILE_EDIT_PANEL_CLASS =
  "pointer-events-auto relative flex w-[min(36rem,92vw)] max-w-[42rem] flex-col overflow-hidden rounded-[1.1rem] border border-[#b83232]/40 bg-[#f5f0e6]/84 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_16px_42px_rgba(26,15,10,0.36)]"

export const PROFILE_EDIT_HEADER_CLASS =
  "border-b border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.65rem,1.2vh,0.85rem)]"

export const PROFILE_EDIT_TABS_CLASS =
  "flex items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const PROFILE_EDIT_TAB_BTN_CLASS =
  "relative w-[clamp(7.5rem,22vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const PROFILE_EDIT_TAB_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const PROFILE_EDIT_TAB_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const PROFILE_EDIT_TAB_BTN_LABEL_INACTIVE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#5c554d] [text-shadow:0_1px_1px_rgba(245,240,230,0.35)]"

export const PROFILE_EDIT_PREVIEW_SECTION_CLASS =
  "flex items-center justify-center border-b border-[#2a1810]/12 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.85rem,1.8vh,1.15rem)]"

export const PROFILE_EDIT_PREVIEW_WRAP_CLASS =
  "relative aspect-square w-[clamp(6.5rem,18vw,9.5rem)] select-none"

export const PROFILE_EDIT_PREVIEW_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const PROFILE_EDIT_PREVIEW_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

export const PROFILE_EDIT_PREVIEW_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

export const PROFILE_EDIT_GRID_SECTION_CLASS =
  `min-h-[min(10rem,28vh)] max-h-[min(16rem,38vh)] overflow-y-auto overscroll-contain px-[clamp(0.75rem,1.35vw,1rem)] py-[clamp(0.65rem,1.2vh,0.85rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const PROFILE_EDIT_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(clamp(3.75rem,11vw,4.75rem),1fr))] gap-[clamp(0.45rem,0.85vw,0.65rem)]"

export const PROFILE_EDIT_OPTION_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0"

export const PROFILE_EDIT_OPTION_CARD_CLASS =
  "flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-[#2a1810]/14 bg-[#1a0f0a]/06 transition-[box-shadow,ring-color] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12),_0_4px_14px_rgba(0,0,0,0.12)]"

export const PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS =
  "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.16),_0_4px_14px_rgba(0,0,0,0.16),_0_0_16px_rgba(180,40,40,0.38),_0_0_6px_rgba(220,50,50,0.28)]"

export const PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS =
  "flex h-[82%] w-[82%] items-center justify-center overflow-hidden rounded-full"

export const PROFILE_EDIT_OPTION_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.22] select-none object-cover object-center"

export const PROFILE_EDIT_OPTION_BORDER_CLASS =
  "block h-[88%] w-[88%] select-none object-contain object-center"

export const PROFILE_EDIT_FOOTER_CLASS =
  "border-t border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.75rem,1.35vh,1rem)]"

export const PROFILE_EDIT_CONFIRM_BTN_CLASS =
  "relative mx-auto block w-[min(100%,14rem)] cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const PROFILE_EDIT_CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.35rem,2%,0.65rem)] top-[clamp(0.45rem,2.2%,0.65rem)] z-20 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const PROFILE_EDIT_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.1rem,3.8vw,2.65rem)] select-none"

// 프로필 수정 — 선택지 catalog

const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"

// F-13 AC-01/AC-02 대응 — 서버 카탈로그(backend/economy/catalog.js PROFILE_PHOTO_NAMES)의
// player-profile-{name} itemId 규칙과 정확히 같은 파일명 대응이다. profileBorderAssetSrcForItemId와
// 같은 이유(A-10 관례)로, 사진도 이제 클라이언트가 임의로 정하지 않고 서버가 확정한
// itemId에서만 표시 자산을 유도한다 — 편집기가 실제로 서버에 저장을 요청할 값(itemId)과
// 화면에 그릴 자산(src)을 하나의 이름 목록에서 함께 유도해 둘이 어긋나지 않게 한다.
// 이름 문자열은 정규화 전(NFC 소스 그대로) 상태로만 취급하고, 자산 경로를 만드는 마지막
// 순간에만 normalize("NFD")한다 — 이미 NFD로 정규화된 문자열에서 접두사를 다시 잘라내면
// (한글 자모 분해로 바이트 경계가 달라져) 비교·슬라이스가 깨질 수 있기 때문이다.
const PROFILE_PHOTO_ITEM_ID_PREFIX = "player-profile-"

/** 무료로 제공되는 프로필 이미지 표시 순서(더미친구 제외). */
const PROFILE_PHOTO_NAMES_IN_DISPLAY_ORDER = [
  "금빛가면", "마인", "사냥꾼", "기사", "붉은기운", "악당", "영애", "수녀",
  "영주", "화관쓴소녀", "암살자", "역병의사", "그림자", "음유시인", "드워프", "귀부인",
]

const photoAssetSrcForName = (name) => `${PROFILE_PHOTO_BASE}프로필-${name}.png`.normalize("NFD")

export const PROFILE_EDIT_FREE_PHOTOS = PROFILE_PHOTO_NAMES_IN_DISPLAY_ORDER.map(photoAssetSrcForName)

/** 서버 카탈로그와 같은 기본 지급 사진 itemId(backend DEFAULT_PROFILE_PHOTO_ID). */
export const DEFAULT_PROFILE_PHOTO_ITEM_ID = `${PROFILE_PHOTO_ITEM_ID_PREFIX}금빛가면`

/** backend economy.service.getWalletSummary가 돌려주는 entitlement.itemType 값
 *  (backend/economy/catalog.js ITEM_TYPES.PROFILE_PHOTO). */
export const PROFILE_PHOTO_ITEM_TYPE = "PROFILE_PHOTO"

/** 서버 entitlement/loadout의 사진 itemId를 실제 표시 자산 경로로 바꾼다. itemId가 사진
 *  규칙을 따르지 않으면(알 수 없는 값) null을 돌려준다 — 호출부가 기본 사진으로 대체한다.
 *  @param {string | null | undefined} itemId @returns {string | null} */
export const profilePhotoAssetSrcForItemId = (itemId) => {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PROFILE_PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return photoAssetSrcForName(name)
}

/** 편집기 사진 그리드가 그릴 {itemId, src} 목록 — PROFILE_EDIT_FREE_PHOTOS와 같은 표시
 *  순서를 유지한다. 현재 카탈로그의 사진 16종은 전부 defaultGrant(무료 기본 지급)이라
 *  모든 계정이 항상 전부 소유하지만, 앞으로 구매·업적으로만 얻는 사진이 카탈로그에
 *  추가되면 이 목록 대신 entitlements에서 유도한 소유 목록으로 바꿔야 한다(border 탭과
 *  같은 패턴, A-07). */
export const PROFILE_EDIT_PHOTO_OPTIONS = PROFILE_PHOTO_NAMES_IN_DISPLAY_ORDER.map((name) => ({
  itemId: `${PROFILE_PHOTO_ITEM_ID_PREFIX}${name}`,
  src: photoAssetSrcForName(name),
}))

// F-12(AC-06) 재검토 대응 — 서버 카탈로그(backend/economy/catalog.js)의 profile-border-{tier}
// itemId 규칙과 정확히 같은 파일명 대응이다. 기본 지급(평민)·구매 테두리(남작~황제)·업적
// 지급 직업 테두리(귀족~마녀사냥꾼) 모두 같은 `프로필프레임-{tier}.png` 자산 하나로
// 귀결되므로, 예전처럼 정적 배열로 다시 나열하지 않고 서버가 돌려준 itemId에서 직접
// 유도한다(A-10) — noble(귀족)을 포함해 서버가 실제로 소유했다고 응답한 어떤 티어든 같은
// 규칙으로 자산을 찾는다.
const PROFILE_BORDER_ITEM_ID_PREFIX = "profile-border-"

/** 서버 카탈로그(backend/economy/catalog.js DEFAULT_PROFILE_BORDER_ID)와 같은 기본 지급
 *  테두리 itemId. 프론트·백엔드가 별도 런타임이라 문자열을 다시 적는다(catalog.js의 기존
 *  관례와 같음). */
export const DEFAULT_PROFILE_BORDER_ITEM_ID = `${PROFILE_BORDER_ITEM_ID_PREFIX}평민`

/** backend economy.service.getWalletSummary가 돌려주는 entitlement.itemType 값
 *  (backend/economy/catalog.js ITEM_TYPES.PROFILE_BORDER). */
export const PROFILE_BORDER_ITEM_TYPE = "PROFILE_BORDER"

/** 서버 entitlement/loadout의 itemId를 실제 표시 자산 경로로 바꾼다. itemId가 테두리
 *  규칙을 따르지 않으면(알 수 없는 값) null을 돌려준다 — 호출부가 기본 테두리로 대체한다.
 *  @param {string | null | undefined} itemId @returns {string | null} */
export const profileBorderAssetSrcForItemId = (itemId) => {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_BORDER_ITEM_ID_PREFIX)) return null
  const tier = itemId.slice(PROFILE_BORDER_ITEM_ID_PREFIX.length)
  if (!tier) return null
  return `${PROFILE_BORDER_BASE}프로필프레임-${tier}.png`.normalize("NFD")
}

export const PROFILE_EDIT_TAB_PHOTO = "photo"
export const PROFILE_EDIT_TAB_BORDER = "border"

export const PROFILE_EDIT_TABS = [
  { id: PROFILE_EDIT_TAB_PHOTO, label: "프로필 수정" },
  { id: PROFILE_EDIT_TAB_BORDER, label: "테두리 수정" },
]

// F-12(AC-06): 테두리 그리드의 로딩/오류/빈 소유 목록 상태 표시(계획 메모 실행 순서 (2)).
export const PROFILE_EDIT_GRID_STATUS_TEXT_CLASS =
  "flex flex-col items-center gap-[0.5rem] px-[0.5rem] py-[1rem] text-center font-body app-text-scaled [--app-text-size:0.85rem] text-[#5c554d]"

export const PROFILE_EDIT_GRID_RETRY_BTN_CLASS =
  "cursor-pointer rounded-md border border-[#b83232]/40 bg-transparent px-[0.75rem] py-[0.3rem] font-body app-text-scaled [--app-text-size:0.82rem] text-[#b83232] transition-opacity hover:opacity-80"

export const PROFILE_EDIT_ERROR_TEXT_CLASS =
  "px-[clamp(0.85rem,1.5vw,1.15rem)] pb-[0.35rem] text-center font-body app-text-scaled [--app-text-size:0.8rem] text-[#b83232]"
