// 로비 왼쪽 메뉴 영역 (로고 + 메뉴 버튼)
// LobbyPage가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import {
  LOBBY_LOGO_CLASS,
  LOBBY_SIDE_MENU_CLASS,
} from "@/shared/constants/lobbyLayoutStyle.js"
import LobbyMenuNav from "@/domains/lobby/components/LobbyMenuNav.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 로고 아래에 메뉴 버튼 줄을 둠
export default function LobbyMenuArea() {
  return (
    <aside className={LOBBY_SIDE_MENU_CLASS}>
      <PublicAsset src={LOBBY_ASSETS.logo} alt="The Joker" className={LOBBY_LOGO_CLASS} />
      <LobbyMenuNav />
    </aside>
  )
}
