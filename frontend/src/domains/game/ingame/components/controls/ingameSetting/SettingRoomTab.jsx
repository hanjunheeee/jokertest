// 설정 창 방관리 탭(방장만): 다음 판 방 안내 한 줄 ("다음 게임 설정 유지" 스위치는 없앰, 판이 끝나면 늘 같은 코드·설정으로 대기방이 다시 열림)
// 설정 창 내용(SettingPanelContent)이 사용, 글은 ingameSettingData
import { INGAME_SETTING_ROOM_NOTICE } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"

// 안내 글 모양 (어두운 설정 창 위 밝은 글자)
const NOTICE_CLASS =
  "mt-[0.45rem] px-[0.6rem] text-left font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1vw,0.92rem)] leading-snug text-[#f0e0c8]/85"

// 방관리 탭 본문
export default function SettingRoomTab() {
  return (
    <div className={TAB_BODY_CLASS}>
      <p className={NOTICE_CLASS} data-testid="ingame-room-tab-notice">{INGAME_SETTING_ROOM_NOTICE}</p>
    </div>
  )
}
