import { LOBBY_MENU_BUTTONS } from "@/domains/lobby/constants/lobbyAssets.js"

// 로비 왼쪽 메뉴에 표시할 버튼 목록입니다.
export const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이", src: LOBBY_MENU_BUTTONS.gameplay },
  { id: "settings", label: "설정", src: LOBBY_MENU_BUTTONS.settings },
  { id: "store", label: "상점", src: LOBBY_MENU_BUTTONS.store },
  { id: "archive", label: "기억의 서고", src: LOBBY_MENU_BUTTONS.archive },
  { id: "exit", label: "종료", src: LOBBY_MENU_BUTTONS.exit },
]

// 메뉴 id별 이동 경로입니다. 로그아웃처럼 별도 처리가 필요한 메뉴는 여기서 제외합니다.
export const LOBBY_MENU_ROUTES = {
  gameplay: "/gameMode",
  settings: "/setting",
  store: "/store",
}
