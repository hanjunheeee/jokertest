/**
 * 인게임 페이지 공통 public 에셋.
 *
 * InGamePage 배경 등 도메인 전역 1회 사용 리소스만 둡니다.
 */

/** 인게임 화면 public 에셋 (frontend/public 기준) */
export const INGAME_ASSETS = {
  bg: "/bg/인게임-전경보드(뒷배경).png",
  bgNight: "/bg/인게임-전경보드(뒷배경) 밤.png".normalize("NFD"),
}

/** @param {string|undefined|null} phase canonical GameSession phase */
export function selectInGameBackgroundAsset(phase) {
  return phase === "NIGHT" ? INGAME_ASSETS.bgNight : INGAME_ASSETS.bg
}
