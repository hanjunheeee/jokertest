import { PLAYER_ASSETS } from "../../../constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_BTN_LABEL_CLASS,
  NAME_CLASS,
  PROFILE_PHOTO_WRAP_CLASS,
  PROFILE_WRAP_CLASS,
  ROW_CLASS,
  ROW_INNER_CLASS,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerLayout.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../constants/controls/kickPlayer/ingameKickPlayerData.js"
import { THEME_TEXT_RENDER_CLASS } from "../../../../../../shared/constants/ingamePlayerTheme.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function SettingKickPlayerRow({
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
    `${NAME_CLASS} ${themeStyles ? THEME_TEXT_RENDER_CLASS : ""}`.trim()

  return (
    <li className={ROW_CLASS}>
      <div className={ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={PROFILE_WRAP_CLASS}
          photoWrapClassName={PROFILE_PHOTO_WRAP_CLASS}
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
          className={ACTION_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={PLAYER_ASSETS.kickActionButton}
            alt=""
            className={ACTION_BTN_IMG_CLASS}
          />
          <span className={ACTION_BTN_LABEL_CLASS}>
            {isPending
              ? INGAME_KICK_PLAYER_MODAL_COPY.pendingLabel
              : INGAME_KICK_PLAYER_MODAL_COPY.kickActionLabel}
          </span>
        </button>
      </div>
    </li>
  )
}
