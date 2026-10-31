import { PLAYER_PROFILE_ASSETS } from "../constants/playerProfileAssets.js"

const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PROFILE_PHOTO_ITEM_ID_PREFIX = "player-profile-"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"
const PROFILE_BORDER_ITEM_ID_PREFIX = "profile-border-"

export function resolveAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PROFILE_PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${PROFILE_PHOTO_BASE}프로필-${name}.png`.normalize("NFD")
}

export function resolveAccountProfileBorderSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_BORDER_ITEM_ID_PREFIX)) return null
  const tier = itemId.slice(PROFILE_BORDER_ITEM_ID_PREFIX.length)
  if (!tier) return null
  return `${PROFILE_BORDER_BASE}프로필프레임-${tier}.png`.normalize("NFD")
}

export function resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId } = {}) {
  return {
    portraitSrc: resolveAccountProfilePhotoSrc(accountProfilePhotoId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    frameSrc: resolveAccountProfileBorderSrc(accountProfileBorderId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
  }
}
