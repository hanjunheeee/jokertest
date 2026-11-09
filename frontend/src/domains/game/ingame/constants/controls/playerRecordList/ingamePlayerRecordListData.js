// 플레이어 기록 목록 사진·테두리 경로 고르기
// 기록 목록·강퇴·친구 초대·결과 화면이 같이 씀
import {
  resolveAccountProfileBorderSrc,
  resolveAccountProfilePhotoSrc,
} from "@/shared/utils/resolveAccountProfileAssets.js"

const PROFILE_BASE = "/shopItem/player-profile/"
const BORDER_BASE = "/shopItem/player- profileborder/"

const PROFILE_PHOTO_FILES = [
  "프로필-금빛가면.webp",
  "프로필-기사.webp",
  "프로필-사냥꾼.webp",
  "프로필-귀부인.webp",
  "프로필-영주.webp",
  "프로필-암살자.webp",
  "프로필-그림자.webp",
  "프로필-악당.webp",
  "프로필-역병의사.webp",
  "프로필-음유시인.webp",
  "프로필-영애.webp",
  "프로필-붉은기운.webp",
]

const PROFILE_BORDER_FILES = [
  "프로필프레임-황제.webp",
  "프로필프레임-공작.webp",
  "프로필프레임-백작.webp",
  "프로필프레임-후작.webp",
  "프로필프레임-남작.webp",
  "프로필프레임-자작.webp",
  "프로필프레임-귀족.webp",
  "프로필프레임-광대.webp",
  "프로필프레임-주치의.webp",
  "프로필프레임-평민.webp",
  "프로필프레임-경비원.webp",
  "프로필프레임-마녀사냥꾼.webp",
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

// 그 사람 사진·테두리 (보드 카드와 같은 사진 먼저, 계정 아이템, 둘 다 없을 때만 줄 순서 기본 그림)
export function resolvePlayerRecordListProfileAssets(player, index = 0) {
  const fallback = getPlayerRecordListFallbackProfileAssets(index)
  const portraitSrc = typeof player?.portraitSrc === "string" && player.portraitSrc.length > 0
    ? player.portraitSrc
    : null
  return {
    profilePhotoSrc: portraitSrc
      ?? resolveAccountProfilePhotoSrc(player?.accountProfilePhotoId)
      ?? fallback.profilePhotoSrc,
    profileBorderSrc: resolveAccountProfileBorderSrc(player?.accountProfileBorderId)
      ?? fallback.profileBorderSrc,
  }
}
