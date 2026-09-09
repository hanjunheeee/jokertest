/**
 * 인게임 페이지 공통 public 에셋.
 *
 * InGamePage 배경 등 도메인 전역 1회 사용 리소스만 둡니다.
 */

/** 인게임 화면 public 에셋 (frontend/public 기준) */
export const INGAME_ASSETS = {
  bg: "/bg/인게임-전경보드(뒷배경).png",
  // 밤 배경 — InGameBackground가 낮 배경 위에 겹쳐 두고 phase에 따라 crossfade한다.
  // 이 저장소의 public 에셋 파일명은 NFC로 커밋되어 있어 경로 문자열도 NFC 그대로 쓴다.
  bgNight: "/bg/인게임-전경보드(뒷배경) 밤.png",
}
