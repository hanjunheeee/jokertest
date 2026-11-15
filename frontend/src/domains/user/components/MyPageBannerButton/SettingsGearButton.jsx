// 배너 위 톱니 장식 (눌러도 아무 데도 안 감, 계정 관리는 마이페이지 "계정 관리" 단추)
// MyPageBannerButton이 씀
import { LOBBY_ASSETS } from "../../../../shared/constants/lobbyAssets.js"
import { LOBBY_SETTINGS_GEAR_LAYOUT } from "../../constants/myPageBannerStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 단추가 아니라 그림만: 이름·초점·손가락 모양·누름 움직임 없음, 배너 단추와 따로 놓여 누름이 번지지 않음
export default function SettingsGearButton() {
  return (
    <span
      aria-hidden="true"
      className="absolute z-10 block select-none leading-none"
      style={{
        top: LOBBY_SETTINGS_GEAR_LAYOUT.top,
        right: LOBBY_SETTINGS_GEAR_LAYOUT.right,
        width: LOBBY_SETTINGS_GEAR_LAYOUT.size,
        height: LOBBY_SETTINGS_GEAR_LAYOUT.size,
      }}
    >
      <PublicAsset
        src={LOBBY_ASSETS.settingsGear}
        alt=""
        className="block h-full w-full select-none object-contain"
      />
    </span>
  )
}
