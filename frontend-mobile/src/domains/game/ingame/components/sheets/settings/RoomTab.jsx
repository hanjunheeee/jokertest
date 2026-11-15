// 설정 시트 방관리 탭(방장만): 다음 판 방 안내 한 줄 ("다음 게임 설정 유지" 스위치는 없앰, 데스크톱 SettingRoomTab과 같은 글)
// SettingsBody가 씀
import { INGAME_SETTING_ROOM_NOTICE } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import { NOTICE_CLASS, TAB_BODY_CLASS } from "./rowStyle.js"

// 방관리 탭 본문
export default function RoomTab() {
  return (
    <div className={TAB_BODY_CLASS}>
      <p className={NOTICE_CLASS} data-testid="ingame-room-tab-notice">{INGAME_SETTING_ROOM_NOTICE}</p>
    </div>
  )
}
