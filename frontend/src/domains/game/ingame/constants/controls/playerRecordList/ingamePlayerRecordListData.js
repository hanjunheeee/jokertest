const PROFILE_BASE = "/shopItem/player-profile/"
const BORDER_BASE = "/shopItem/player- profileborder/"

const PROFILE_PHOTO_FILES = [
  "프로필-금빛가면.png",
  "프로필-기사.png",
  "프로필-사냥꾼.png",
  "프로필-귀부인.png",
  "프로필-영주.png",
  "프로필-암살자.png",
  "프로필-그림자.png",
  "프로필-악당.png",
  "프로필-역병의사.png",
  "프로필-음유시인.png",
  "프로필-영애.png",
  "프로필-붉은기운.png",
]

const PROFILE_BORDER_FILES = [
  "프로필프레임-황제.png",
  "프로필프레임-공작.png",
  "프로필프레임-백작.png",
  "프로필프레임-후작.png",
  "프로필프레임-남작.png",
  "프로필프레임-자작.png",
  "프로필프레임-귀족.png",
  "프로필프레임-광대.png",
  "프로필프레임-주치의.png",
  "프로필프레임-평민.png",
  "프로필프레임-경비원.png",
  "프로필프레임-마녀사냥꾼.png",
]

export function getPlayerRecordListProfileAssets(index = 0) {
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0

  return {
    profilePhotoSrc:
      `${PROFILE_BASE}${PROFILE_PHOTO_FILES[safeIndex % PROFILE_PHOTO_FILES.length]}`.normalize("NFD"),
    profileBorderSrc:
      `${BORDER_BASE}${PROFILE_BORDER_FILES[safeIndex % PROFILE_BORDER_FILES.length]}`.normalize("NFD"),
  }
}

export const PLAYER_RECORD_STATS_UNAVAILABLE_LABEL = "조회 실패"

export function formatPlayerRecordStats({ totalGames, winRate } = {}) {
  if (!Number.isInteger(totalGames) || !Number.isInteger(winRate)) {
    return PLAYER_RECORD_STATS_UNAVAILABLE_LABEL
  }
  return `${totalGames}판 | ${winRate}%`
}

export function getPlayerRecordListFallbackProfileAssets(index = 0) {
  return getPlayerRecordListProfileAssets(index)
}
