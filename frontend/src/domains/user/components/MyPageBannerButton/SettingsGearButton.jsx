import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import {
  LOBBY_SETTINGS_GEAR_LAYOUT,
  MY_PAGE_BANNER_SETTINGS_BTN_CLASS,
  MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 마이페이지 배너 위에 겹쳐 보이는 설정 톱니 버튼입니다.
export default function SettingsGearButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="계정 설정"
      onClick={(event) => {
        // 배너 전체 클릭까지 같이 실행되지 않도록 여기서 이벤트를 멈춥니다.
        // 이게 없으면 톱니를 눌렀을 때 마이페이지 이동 클릭도 같이 실행될 수 있습니다.
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
      {/* 실제 톱니바퀴 이미지입니다. 버튼 이름은 aria-label로 이미 제공했습니다. */}
      <PublicAsset src={LOBBY_ASSETS.settingsGear} alt="" className={MY_PAGE_BANNER_SETTINGS_GEAR_IMG_CLASS} />
    </button>
  )
}
