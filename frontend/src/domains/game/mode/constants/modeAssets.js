/** GameModePage·MultiplayEntryPage 공통 배경 이미지 (frontend/public 기준) */
export const MODE_SCREEN_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
}

const MODE_FRAMES = {
  singlePlay: "/frame/gameMode/싱글플레이 프레임.png",
  multiPlay: "/frame/gameMode/멀티플레이 프레임.png",
  secretBanquet: "/frame/gameMode/비밀연회장 프레임.png",
  createGame: "/frame/gameMode/게임 만들기 프레임.png",
  findGame: "/frame/gameMode/게임 찾기 프레임.png",
}

/** prototype 게임모드 선택창2.png — 좌→우 카드 순서 */
export const GAME_MODES = [
  {
    id: "single",
    label: "싱글플레이",
    frame: MODE_FRAMES.singlePlay,
  },
  {
    id: "multi",
    label: "멀티플레이",
    frame: MODE_FRAMES.multiPlay,
  },
  {
    id: "secret-banquet",
    label: "비밀연회장",
    frame: MODE_FRAMES.secretBanquet,
  },
]

/** prototype 게임모드 선택창-멀티플레이 선택.png — 좌→우 카드 순서 */
export const MULTIPLAY_OPTIONS = [
  {
    id: "create",
    label: "게임 만들기",
    frame: MODE_FRAMES.createGame,
  },
  {
    id: "find",
    label: "게임 찾기",
    frame: MODE_FRAMES.findGame,
  },
]
