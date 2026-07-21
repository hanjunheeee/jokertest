// 로비 화면의 주요 public 에셋 경로입니다.
export const LOBBY_ASSETS = {
  bgVideo: "/bg/대기실 배경 영상4.mp4",
  logo: "/logo/가면무도회 로고4.png".normalize("NFD"),
  myPageButton: "/button/마이페이지 이동 버튼_프로토타입2.png".normalize("NFD"),
  settingsGear: "/button/설정톱니바퀴.png",
}

// 아래 파일들은 저장소에서 macOS의 분해형 유니코드(NFD) 이름으로 저장되어 있습니다.
// Linux/Docker에서도 실제 파일명과 정확히 일치하도록 요청 경로를 NFD로 통일합니다.
export const LOBBY_MENU_BUTTONS = {
  gameplay: "/button/lobby-menu/게임플레이_3.png".normalize("NFD"),
  settings: "/button/lobby-menu/설정_3.png".normalize("NFD"),
  store: "/button/lobby-menu/상점_3.png".normalize("NFD"),
  archive: "/button/lobby-menu/기억의 서고_3.png".normalize("NFD"),
  exit: "/button/lobby-menu/로그아웃_3.png".normalize("NFD"),
}
