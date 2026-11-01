import { INGAME_KICK_PLAYER_ASSETS } from "../../../constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import {
  INGAME_KICK_PLAYER_ACTION_BTN_CLASS,
  INGAME_KICK_PLAYER_ACTION_BTN_IMG_CLASS,
  INGAME_KICK_PLAYER_ACTION_BTN_LABEL_CLASS,
  INGAME_KICK_PLAYER_NAME_CLASS,
  INGAME_KICK_PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  INGAME_KICK_PLAYER_PROFILE_WRAP_CLASS,
  INGAME_KICK_PLAYER_ROW_CLASS,
  INGAME_KICK_PLAYER_ROW_INNER_CLASS,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerLayout.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../constants/controls/kickPlayer/ingameKickPlayerData.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../../constants/ingamePlayerTheme.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function SettingKickPlayerRow({
  playerId,
  name,
  profilePhotoSrc,
  profileBorderSrc,
  isPending = false,
  disabled = false,
  themeStyles = null,
  onKick,
}) {
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
              ? INGAME_KICK_PLAYER_MODAL_COPY.pendingAriaLabel
              : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel
          }
          onClick={onKick}
          disabled={disabled}
          className={INGAME_KICK_PLAYER_ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={INGAME_KICK_PLAYER_ASSETS.kickActionButton}
            alt=""
            className={INGAME_KICK_PLAYER_ACTION_BTN_IMG_CLASS}
          />
          <span className={INGAME_KICK_PLAYER_ACTION_BTN_LABEL_CLASS}>
            {isPending
              ? INGAME_KICK_PLAYER_MODAL_COPY.pendingLabel
              : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel}
          </span>
        </button>
      </div>
    </li>
  )
}
