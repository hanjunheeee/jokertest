// 배너 위 톱니 버튼 (계정 설정)
// MyPageBannerButton이 씀
import { LOBBY_ASSETS } from "../../../../shared/constants/lobbyAssets.js"
import {
  LOBBY_SETTINGS_GEAR_LAYOUT,
  SETTINGS_BTN_CLASS,
  SETTINGS_GEAR_IMG_CLASS,
} from "../../constants/myPageBannerStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 누름이 바깥으로 번지지 않게 막음
export default function SettingsGearButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="계정 설정"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className={SETTINGS_BTN_CLASS}
      style={{
        top: LOBBY_SETTINGS_GEAR_LAYOUT.top,
        right: LOBBY_SETTINGS_GEAR_LAYOUT.right,
        width: LOBBY_SETTINGS_GEAR_LAYOUT.size,
        height: LOBBY_SETTINGS_GEAR_LAYOUT.size,
      }}
    >
      <PublicAsset src={LOBBY_ASSETS.settingsGear} alt="" className={SETTINGS_GEAR_IMG_CLASS} />
    </button>
  )
}
