const PHOTO_BASE = "/shopItem/player-profile/ingame/"
const ITEM_ID_PREFIX = "player-profile-"

const NAMES_WITHOUT_SQUARE_SUFFIX = new Set(["화관쓴소녀"])

function photoFileName(name) {
  if (NAMES_WITHOUT_SQUARE_SUFFIX.has(name)) {
    return `프로필-${name}.png`
  }
  return `프로필-${name}_사각형.png`
}

export function resolveInGameAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(ITEM_ID_PREFIX)) return null
  const name = itemId.slice(ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${PHOTO_BASE}${photoFileName(name)}`.normalize("NFD")
}
