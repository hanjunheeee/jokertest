const INGAME_PROFILE_PHOTO_BASE = "/shopItem/player-profile/ingame/"
const PROFILE_PHOTO_ITEM_ID_PREFIX = "player-profile-"

/** ingame 폴더에 `_사각형` 접미사 없이 배치된 예외(프로필-화관쓴소녀.png). */
const INGAME_PROFILE_PHOTO_NAMES_WITHOUT_SQUARE_SUFFIX = new Set(["화관쓴소녀"])

function ingameProfilePhotoFileName(name) {
  if (INGAME_PROFILE_PHOTO_NAMES_WITHOUT_SQUARE_SUFFIX.has(name)) {
    return `프로필-${name}.png`
  }
  return `프로필-${name}_사각형.png`
}

/** 인게임 플레이어 카드용 계정 프로필 사진 itemId → ingame 사각형 자산 경로.
 *  @param {string | null | undefined} itemId @returns {string | null} */
export function resolveInGameAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PROFILE_PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${INGAME_PROFILE_PHOTO_BASE}${ingameProfilePhotoFileName(name)}`.normalize("NFD")
}
