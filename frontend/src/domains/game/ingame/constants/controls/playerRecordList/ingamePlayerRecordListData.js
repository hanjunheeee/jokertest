/**
 * 플레이어별 전적목록 프로필 자산·포맷 유틸.
 *
 * 전적(판수·승률)은 더 이상 이 파일이 만들지 않습니다 — 서버가 게임 시작 페이로드·재접속
 * 스냅샷의 players[]에 실어 주는 accountTotalGames/accountWinRate가 유일한 원천입니다
 * (CO S-1). 프로필 사진·테두리만 아직 슬롯 index 순환 자산을 씁니다.
 */

// 슬롯 index → shopItem 프로필 사진·테두리 순환. 전적목록 행과 게임 결과 화면
// 플레이어 행이 같은 규칙을 공유해야 "같은 슬롯 = 같은 프로필"이 화면 사이에서 어긋나지
// 않는다(gameResultPreviewData·buildGameResultViewModel이 이 함수를 그대로 쓴다).
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

/**
 * 슬롯 index에 대응하는 프로필 사진·테두리 public 경로.
 *
 * 경로는 macOS 체크아웃을 위해 NFD로 맞춘다(publicAsset이 요청 직전에 NFC로 되돌린다) —
 * shared/constants/playerProfileAssets.js와 동일한 관례다.
 *
 * @param {number} index 목록 슬롯 index
 */
export function getPlayerRecordListProfileAssets(index = 0) {
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0

  return {
    profilePhotoSrc:
      `${PROFILE_BASE}${PROFILE_PHOTO_FILES[safeIndex % PROFILE_PHOTO_FILES.length]}`.normalize("NFD"),
    profileBorderSrc:
      `${BORDER_BASE}${PROFILE_BORDER_FILES[safeIndex % PROFILE_BORDER_FILES.length]}`.normalize("NFD"),
  }
}

/**
 * CO S-1(AC-05): 서버가 그 계정의 전적을 조회하지 못했을 때 표시할 문구.
 *
 * 0판 0%로 대신 그리지 않는다 — "정말 한 판도 안 한 계정"과 "조회에 실패한 계정"은 다른
 * 사실이고, 화면이 그 둘을 같은 모양으로 말하면 사용자는 없는 전적을 사실로 읽는다.
 */
export const PLAYER_RECORD_STATS_UNAVAILABLE_LABEL = "조회 실패"

/**
 * 총 판수·승률을 목록 행에 표시할 한 줄 텍스트로 포맷.
 *
 * 서버는 두 값을 함께 싣거나 아예 싣지 않는다(backend buildPlayerAccountProfileFields의
 * own-property 계약) — 그래서 한쪽이라도 숫자가 아니면 반쪽짜리 전적을 지어내지 않고
 * 조회 실패로 말한다. 승률은 서버가 이미 정수 %로 반올림해 내려주므로 여기서 다시
 * 자리수를 만들지 않는다(두 곳에서 반올림하면 같은 전적이 화면마다 달라진다).
 */
export function formatPlayerRecordStats({ totalGames, winRate } = {}) {
  if (!Number.isInteger(totalGames) || !Number.isInteger(winRate)) {
    return PLAYER_RECORD_STATS_UNAVAILABLE_LABEL
  }
  return `${totalGames}판 | ${winRate}%`
}

/** 더미가 없는 슬롯용 기본 프로필 UI */
export function getPlayerRecordListFallbackProfileAssets(index = 0) {
  return getPlayerRecordListProfileAssets(index)
}
