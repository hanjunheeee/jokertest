/**
 * 플레이어 추방 모달 — 플레이어 1명 + 추방 버튼
 */
import {
  INGAME_KICK_PLAYER_ACTION_BTN_CLASS,
  INGAME_KICK_PLAYER_NAME_CLASS,
  INGAME_KICK_PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  INGAME_KICK_PLAYER_PROFILE_WRAP_CLASS,
  INGAME_KICK_PLAYER_ROW_CLASS,
  INGAME_KICK_PLAYER_ROW_INNER_CLASS,
} from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../../../constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "../../../InGamePlayerSessionContext.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

export default function SettingKickPlayerRow({
  playerId,
  name,
  profilePhotoSrc,
  profileBorderSrc,
  isPending = false,
  onKick,
}) {
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null
  const nameStyle = themeStyles ? { color: themeStyles.color } : undefined
  const nameClass =
    `${INGAME_KICK_PLAYER_NAME_CLASS} ${themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""}`.trim()

  return (
    <li className={INGAME_KICK_PLAYER_ROW_CLASS}>
      <div className={INGAME_KICK_PLAYER_ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={INGAME_KICK_PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={INGAME_KICK_PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <p className={nameClass} style={nameStyle}>
          {name}
        </p>

        <button
          type="button"
          aria-label={
            isPending
              ? INGAME_KICK_PLAYER_MODAL_COPY.cancelPendingAriaLabel
              : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel
          }
          onClick={onKick}
          className={INGAME_KICK_PLAYER_ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          {isPending ? INGAME_KICK_PLAYER_MODAL_COPY.pendingLabel : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel}
        </button>
      </div>
    </li>
  )
}
