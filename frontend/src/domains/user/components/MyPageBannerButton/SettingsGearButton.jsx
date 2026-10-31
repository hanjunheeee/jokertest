import { LOBBY_ASSETS } from "../../../lobby/constants/lobbyAssets.js"
import {
  LOBBY_SETTINGS_GEAR_LAYOUT,
  MY_PAGE_BANNER_SETTINGS_BTN_CLASS,
  MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS,
} from "../../constants/myPageBannerStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function SettingsGearButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="계정 설정"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className={MY_PAGE_BANNER_SETTINGS_BTN_CLASS}
      style={{
        top: LOBBY_SETTINGS_GEAR_LAYOUT.top,
        right: LOBBY_SETTINGS_GEAR_LAYOUT.right,
        width: LOBBY_SETTINGS_GEAR_LAYOUT.size,
        height: LOBBY_SETTINGS_GEAR_LAYOUT.size,
      }}
    >
      <PublicAsset src={LOBBY_ASSETS.settingsGear} alt="" className={MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS} />
    </button>
  )
}
