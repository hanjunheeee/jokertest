/**
 * Player Portrait Mask — variant별 클리핑·fit 설정.
 *
 * PlayerPortraitFrame에서 사용합니다.
 * 프레임 장식 PNG는 컨텍스트별로 다르고, 초상 inset·fit만 여기서 공유합니다.
 */

/** 초상창 공통 배경 그라데이션 */
export const PLAYER_PORTRAIT_BG_GRADIENT_CLASS =
  "absolute inset-0 bg-gradient-to-b from-[#ddd2bc] via-[#cfc3aa] to-[#bfb39a]"

/** 클로즈업 PNG — 프레임 안 꽉 채우기 (추가 CSS 크롭 없음) */
export const PLAYER_PORTRAIT_CLOSEUP_IMAGE_CLASS =
  "absolute inset-0 block h-full w-full select-none object-cover object-center"

/** 인게임 Player Frame — 클로즈업을 프레임 안에서 약간 축소 */
export const PLAYER_PORTRAIT_INGAME_CLOSEUP_IMAGE_CLASS =
  "absolute left-1/2 top-1/2 block h-[90%] w-[90%] -translate-x-1/2 -translate-y-1/2 select-none object-cover object-center"

/** 전신 PNG — 상반신만 보이도록 확대·상단 정렬 (전적목록 등 레거시) */
export const PLAYER_PORTRAIT_STANDING_CROP_IMAGE_CLASS =
  "absolute top-0 left-1/2 block h-[200%] w-[112%] -translate-x-1/2 select-none object-cover object-[center_10%]"

/**
 * @typedef {Object} PlayerPortraitVariant
 * @property {Record<string, string>} bgInset
 * @property {Record<string, string>} portraitInset
 * @property {string} bgGradientClass
 * @property {string} portraitImageClass
 */

/** @type {Record<string, PlayerPortraitVariant>} */
export const PLAYER_PORTRAIT_VARIANTS = {
  /** 인게임-플레이어프레임 PNG (323×354) — 닉네임 칸 제외 초상창 */
  ingameCard: {
    bgInset: {
      top: "10%",
      bottom: "23%",
      left: "10%",
      right: "10%",
    },
    portraitInset: {
      top: "9%",
      bottom: "21%",
      left: "10%",
      right: "10%",
    },
    bgGradientClass: PLAYER_PORTRAIT_BG_GRADIENT_CLASS,
    portraitImageClass: PLAYER_PORTRAIT_INGAME_CLOSEUP_IMAGE_CLASS,
  },

  /** 친구 프로필 프레임.png (139×141) — 전적목록·친구목록 */
  recordList: {
    bgInset: {
      top: "22%",
      bottom: "22%",
      left: "22%",
      right: "22%",
    },
    portraitInset: {
      top: "22%",
      bottom: "22%",
      left: "22%",
      right: "22%",
    },
    bgGradientClass: PLAYER_PORTRAIT_BG_GRADIENT_CLASS,
    portraitImageClass: PLAYER_PORTRAIT_CLOSEUP_IMAGE_CLASS,
  },

  friendList: {
    bgInset: {
      top: "22%",
      bottom: "22%",
      left: "22%",
      right: "22%",
    },
    portraitInset: {
      top: "22%",
      bottom: "22%",
      left: "22%",
      right: "22%",
    },
    bgGradientClass: PLAYER_PORTRAIT_BG_GRADIENT_CLASS,
    portraitImageClass: PLAYER_PORTRAIT_CLOSEUP_IMAGE_CLASS,
  },

  /** 투표현황 팝업 — 테두리 프레임 크기 유지, 초상 클립 영역만 넓게 */
  voteStatus: {
    bgInset: {
      top: "4%",
      bottom: "4%",
      left: "4%",
      right: "4%",
    },
    portraitInset: {
      top: "2%",
      bottom: "2%",
      left: "2%",
      right: "2%",
    },
    bgGradientClass: PLAYER_PORTRAIT_BG_GRADIENT_CLASS,
    portraitImageClass: PLAYER_PORTRAIT_CLOSEUP_IMAGE_CLASS,
  },
}

/** @param {string} variant */
export function getPlayerPortraitVariant(variant) {
  const config = PLAYER_PORTRAIT_VARIANTS[variant]
  if (!config) {
    throw new Error(`Unknown player portrait variant: ${variant}`)
  }
  return config
}
