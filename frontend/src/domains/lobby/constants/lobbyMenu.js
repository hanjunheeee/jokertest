// 로비 메뉴 항목 표와 메뉴별 이동 경로
// 로비 메뉴(LobbyMenuNav·useLobbyMenuNav)·시험이 씀
import { LOBBY_MENU_BUTTONS } from "../../../shared/constants/lobbyAssets.js"

// 그리는 순서대로 둠
export const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이", src: LOBBY_MENU_BUTTONS.gameplay },
  { id: "settings", label: "설정", src: LOBBY_MENU_BUTTONS.settings },
  { id: "store", label: "상점", src: LOBBY_MENU_BUTTONS.store },
  { id: "archive", label: "기억의 서고", src: LOBBY_MENU_BUTTONS.archive },
  { id: "exit", label: "종료", src: LOBBY_MENU_BUTTONS.exit },
  { id: "customerSupport", label: "고객센터", src: LOBBY_MENU_BUTTONS.customerSupport },
]

// 종료·고객센터는 경로 대신 따로 처리해서 표에 없음
export const LOBBY_MENU_ROUTES = {
  gameplay: "/gameMode",
  settings: "/setting",
  store: "/store",
  archive: "/library",
}
