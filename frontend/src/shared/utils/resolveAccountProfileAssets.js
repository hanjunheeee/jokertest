import { PLAYER_PROFILE_ASSETS } from "../constants/playerProfileAssets.js"

// F-13(AC-05): 대기방·인게임처럼 user 도메인 밖(game 도메인 등)에서도 계정 프로필(사진·
// 테두리) itemId를 실제 표시 자산으로 바꿔야 한다. 이 저장소는 도메인 간 직접 import를
// 피하는 관례를 따르므로(game 도메인이 user 도메인 상수를 import하지 않는다), 여기서는
// frontend/src/domains/user/constants/profileEditLayout.js의 profilePhotoAssetSrcForItemId/
// profileBorderAssetSrcForItemId와 같은 파일명 규칙을 독립적으로 다시 적는다(backend/economy/
// catalog.js가 프론트 자산 규칙을 문자열로 복제하는 것과 같은 이유) — 한쪽이 자산 파일명
// 규칙을 바꾸면 반드시 다른 쪽도 함께 갱신해야 한다.
const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PROFILE_PHOTO_ITEM_ID_PREFIX = "player-profile-"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"
const PROFILE_BORDER_ITEM_ID_PREFIX = "profile-border-"

/** 서버 사진 itemId를 실제 표시 자산 경로로 바꾼다. 규칙을 따르지 않는(알 수 없는) 값이면
 *  null을 돌려준다 — 호출부가 기본/이전 자산을 그대로 쓴다.
 *  @param {string | null | undefined} itemId @returns {string | null} */
export function resolveAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_PHOTO_ITEM_ID_PREFIX)) return null
  const name = itemId.slice(PROFILE_PHOTO_ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${PROFILE_PHOTO_BASE}프로필-${name}.png`.normalize("NFD")
}

/** 서버 테두리 itemId를 실제 표시 자산 경로로 바꾼다. 규칙을 따르지 않는(알 수 없는) 값이면
 *  null을 돌려준다 — 호출부가 기본/이전 자산을 그대로 쓴다.
 *  @param {string | null | undefined} itemId @returns {string | null} */
export function resolveAccountProfileBorderSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PROFILE_BORDER_ITEM_ID_PREFIX)) return null
  const tier = itemId.slice(PROFILE_BORDER_ITEM_ID_PREFIX.length)
  if (!tier) return null
  return `${PROFILE_BORDER_BASE}프로필프레임-${tier}.png`.normalize("NFD")
}

/**
 * 계정 프로필 사진·테두리 id 쌍을 한 번에 표시 자산으로 바꾼다(F-13 AC-05). 누락되거나
 * 유효하지 않은 id에만 기본 자산으로 대체하고, 유효한 id는 그대로 실제 자산으로 바꾼다 —
 * 두 필드는 서로 독립적으로 판정된다(사진만 있고 테두리가 없어도 사진은 정상 해석된다).
 * @param {{ accountProfilePhotoId?: string | null, accountProfileBorderId?: string | null }} [player]
 * @returns {{ portraitSrc: string, frameSrc: string }}
 */
export function resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId } = {}) {
  return {
    portraitSrc: resolveAccountProfilePhotoSrc(accountProfilePhotoId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto,
    frameSrc: resolveAccountProfileBorderSrc(accountProfileBorderId) ?? PLAYER_PROFILE_ASSETS.defaultBorder,
  }
}
