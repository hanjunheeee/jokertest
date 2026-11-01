import { LOBBY_MENU_BUTTONS } from "../../../shared/constants/lobbyAssets.js"

export const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이", src: LOBBY_MENU_BUTTONS.gameplay },
  { id: "settings", label: "설정", src: LOBBY_MENU_BUTTONS.settings },
  { id: "store", label: "상점", src: LOBBY_MENU_BUTTONS.store },
  { id: "archive", label: "기억의 서고", src: LOBBY_MENU_BUTTONS.archive },
  { id: "exit", label: "종료", src: LOBBY_MENU_BUTTONS.exit },
  { id: "customerSupport", label: "고객센터", src: LOBBY_MENU_BUTTONS.customerSupport },
]

export const LOBBY_MENU_ROUTES = {
  gameplay: "/gameMode",
  settings: "/setting",
  store: "/store",
  archive: "/library",
}
