import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_LOGO_CLASS,
  LOBBY_SIDE_MENU_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import LobbyMenuNav from "@/domains/lobby/components/LobbyMenuNav.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function LobbyMenuArea() {
  return (
    <aside className={LOBBY_SIDE_MENU_CLASS}>
      <PublicAsset src={LOBBY_ASSETS.logo} alt="The Joker" className={LOBBY_LOGO_CLASS} />
      <LobbyMenuNav />
    </aside>
  )
}
