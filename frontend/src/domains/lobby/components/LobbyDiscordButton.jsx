import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_DISCORD_BTN_CLASS,
  LOBBY_DISCORD_BTN_IMG_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 로비 Discord 버튼 — 고객센터 메뉴 옆 등에서 재사용 */
export default function LobbyDiscordButton({
  onClick = () => {},
  className = LOBBY_DISCORD_BTN_CLASS,
  imgClassName = LOBBY_DISCORD_BTN_IMG_CLASS,
}) {
  return (
    <button
      type="button"
      aria-label="Discord FAQ"
      onClick={onClick}
      className={className}
      style={{ outline: "none" }}
    >
      <PublicAsset src={LOBBY_ASSETS.discordLogo} alt="" className={imgClassName} />
    </button>
  )
}
