export const PLAYER_PORTRAIT_BG_GRADIENT_CLASS =
  "absolute inset-0 bg-gradient-to-b from-[#ddd2bc] via-[#cfc3aa] to-[#bfb39a]"

export const PLAYER_PORTRAIT_CLOSEUP_IMAGE_CLASS =
  "absolute inset-0 block h-full w-full select-none object-cover object-center"

export const PLAYER_PORTRAIT_INGAME_CLOSEUP_IMAGE_CLASS =
  "absolute left-1/2 top-1/2 block h-[90%] w-[90%] -translate-x-1/2 -translate-y-1/2 select-none object-cover object-center"

export const PLAYER_PORTRAIT_STANDING_CROP_IMAGE_CLASS =
  "absolute top-0 left-1/2 block h-[200%] w-[112%] -translate-x-1/2 select-none object-cover object-[center_10%]"

export const PLAYER_PORTRAIT_VARIANTS = {
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

export function getPlayerPortraitVariant(variant) {
  const config = PLAYER_PORTRAIT_VARIANTS[variant]
  if (!config) {
    throw new Error(`Unknown player portrait variant: ${variant}`)
  }
  return config
}