const INGAME_PROFILE_PHOTO_BASE = "/shopItem/player-profile/ingame/"
const PROFILE_PHOTO_ITEM_ID_PREFIX = "player-profile-"

const INGAME_PROFILE_PHOTO_NAMES_WITHOUT_SQUARE_SUFFIX = new Set(["화관쓴소녀"])

function ingameProfilePhotoFileName(name) {
  if (INGAME_PROFILE_PHOTO_NAMES_WITHOUT_SQUARE_SUFFIX.has(name)) {
    return `프로필-${name}.png`
  }
  return `프로필-${name}_사각형.png`
}

export function resolveInGameAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PROFILE_PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${INGAME_PROFILE_PHOTO_BASE}${ingameProfilePhotoFileName(name)}`.normalize("NFD")
}
