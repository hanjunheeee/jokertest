/**
 * 플레이어별 전적목록 더미 데이터·포맷 유틸.
 *
 * PlayerRecordListContent는 세션 players와 index로 병합합니다.
 * 닉네임은 InGamePlayerSession, 전적·프로필 UI는 API 연동 전 더미를 씁니다.
 */

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

/** prototype 플레이어별 전적목록 탭.png — 더미 전적 */
const DUMMY_PLAYER_RECORDS_BASE = [
  { id: "player-1", name: "플레이어 1", wins: 62, losses: 18, winRate: 77.5 },
  { id: "player-2", name: "플레이어 2", wins: 60, losses: 22, winRate: 73.2 },
  { id: "player-3", name: "플레이어 3", wins: 70, losses: 30, winRate: 70.0 },
  { id: "player-4", name: "플레이어 4", wins: 29, losses: 11, winRate: 72.5 },
  { id: "player-5", name: "플레이어 5", wins: 80, losses: 25, winRate: 76.2 },
  { id: "player-6", name: "플레이어 6", wins: 45, losses: 20, winRate: 69.2 },
  { id: "player-7", name: "플레이어 7", wins: 55, losses: 17, winRate: 76.4 },
  { id: "player-8", name: "플레이어 8", wins: 65, losses: 26, winRate: 71.4 },
  { id: "player-9", name: "플레이어 9", wins: 58, losses: 19, winRate: 75.3 },
  { id: "player-10", name: "플레이어 10", wins: 52, losses: 24, winRate: 68.4 },
]

/** @param {number} index 목록 슬롯 index */
export function getPlayerRecordListProfileAssets(index = 0) {
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0

  return {
    profilePhotoSrc:
      `${PROFILE_BASE}${PROFILE_PHOTO_FILES[safeIndex % PROFILE_PHOTO_FILES.length]}`.normalize("NFD"),
    profileBorderSrc:
      `${BORDER_BASE}${PROFILE_BORDER_FILES[safeIndex % PROFILE_BORDER_FILES.length]}`.normalize("NFD"),
  }
}

export const DUMMY_PLAYER_RECORDS = DUMMY_PLAYER_RECORDS_BASE.map((record, index) => ({
  ...record,
  ...getPlayerRecordListProfileAssets(index),
}))

/** 승/패/승률을 목록 행에 표시할 한 줄 텍스트로 포맷 */
export function formatPlayerRecordStats({ wins, losses, winRate }) {
  return `${wins}승 ${losses}패 | ${winRate.toFixed(1)}%`
}

/** 더미가 없는 슬롯용 기본 프로필 UI */
export function getPlayerRecordListFallbackProfileAssets(index = 0) {
  return getPlayerRecordListProfileAssets(index)
}
