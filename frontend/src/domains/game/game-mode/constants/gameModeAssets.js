/** 게임모드 선택 화면 public 에셋 경로 (frontend/public 기준) */
export const GAME_MODE_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
  singlePlayFrame: "/frame/gameMode/싱글플레이 프레임.png",
  multiPlayFrame: "/frame/gameMode/멀티플레이 프레임.png",
  secretBanquetFrame: "/frame/gameMode/비밀연회장 프레임.png",
  backButton: "/button/뒤로가기 버튼2.png",
  settingsButton: "/button/설정 버튼.png",
  micButton: "/button/마이크 버튼.png",
  menuButton: "/button/햄버거 버튼.png",
}

/** prototype 게임모드 선택창2.png — 좌→우 카드 순서 */
export const GAME_MODES = [
  {
    id: "single",
    label: "싱글플레이",
    frame: GAME_MODE_ASSETS.singlePlayFrame,
  },
  {
    id: "multi",
    label: "멀티플레이",
    frame: GAME_MODE_ASSETS.multiPlayFrame,
  },
  {
    id: "secret-banquet",
    label: "비밀연회장",
    frame: GAME_MODE_ASSETS.secretBanquetFrame,
  },
]
