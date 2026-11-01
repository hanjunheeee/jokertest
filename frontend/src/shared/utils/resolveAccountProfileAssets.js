// 상점 아이템 id → 프로필 사진·테두리 그림 경로 (모르는 id면 기본 그림)
// lobby 친구 목록 줄들·matching 친구 초대 줄·library 초대된 손님 묶기가 씀
import { PLAYER_PROFILE_ASSETS } from "../constants/playerProfileAssets.js"

// 아이템 id 앞부분과 그림 폴더 (테두리 폴더 이름 속 빈칸은 실제 폴더 이름)
const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PHOTO_ITEM_ID_PREFIX = "player-profile-"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"
const BORDER_ITEM_ID_PREFIX = "profile-border-"

// player-profile-이름 → 프로필-이름.png, 모양이 다르면 null
export function resolveAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${PROFILE_PHOTO_BASE}프로필-${name}.png`.normalize("NFD")
}

// profile-border-등급 → 프로필프레임-등급.png, 모양이 다르면 null
export function resolveAccountProfileBorderSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(BORDER_ITEM_ID_PREFIX)) return null
  const tier = itemId.slice(BORDER_ITEM_ID_PREFIX.length)
  if (!tier) return null
  return `${PROFILE_BORDER_BASE}프로필프레임-${tier}.png`.normalize("NFD")
}

// 못 찾으면 기본 사진·평민 테두리
export function resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId } = {}) {
  return {
    portraitSrc: resolveAccountProfilePhotoSrc(accountProfilePhotoId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    frameSrc: resolveAccountProfileBorderSrc(accountProfileBorderId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
  }
}
