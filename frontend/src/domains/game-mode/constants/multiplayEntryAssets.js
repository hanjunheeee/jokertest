/** prototype 게임모드 선택창-멀티플레이 선택.png — 멀티플레이 진입 (게임모드와 동일 배경·유틸) */
export const MULTIPLAY_ENTRY_ASSETS = {
  bg: "/bg/게임모드 선택창 뒷배경.png",
  createFrame: "/frame/gameMode/게임 만들기 프레임.png",
  findFrame: "/frame/gameMode/게임 찾기 프레임.png",
  backButton: "/button/뒤로가기 버튼2.png",
  settingsButton: "/button/설정 버튼.png",
  micButton: "/button/마이크 버튼.png",
  menuButton: "/button/햄버거 버튼.png",
}

/** 좌→우 카드 순서 (prototype) */
export const MULTIPLAY_OPTIONS = [
  {
    id: "create",
    label: "게임 만들기",
    frame: MULTIPLAY_ENTRY_ASSETS.createFrame,
  },
  {
    id: "find",
    label: "게임 찾기",
    frame: MULTIPLAY_ENTRY_ASSETS.findFrame,
  },
]
