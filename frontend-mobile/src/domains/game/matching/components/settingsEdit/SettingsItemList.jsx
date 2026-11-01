// 설정 탭 본문: 양피지 위 항목 줄(숫자·체크), 일반 탭이면 뒤에 역할 구성
// SettingsEditSheet가 씀, 숨길 항목 규칙은 데스크톱 General/MeetingGameSetupTab과 같음 (useSetupForm hiddenIds)
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import RoleComposition from "@m/domains/game/shared/settings/RoleComposition.jsx"
import SettingList from "@m/domains/game/shared/settings/SettingList.jsx"
import { PARCHMENT_STYLE } from "../../constants/settingsEditStyle.js"

// 탭 본문 (form = useSetupForm 값), 탭을 바꾸면 key로 새로 그려서 스크롤을 맨 위로
export default function SettingsItemList({ activeTab, form }) {
  const isGeneral = activeTab === "general"

  return (
    <div
      key={activeTab}
      data-setup-content
      className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border-2 border-[#4a3426] px-4 py-1 shadow-[inset_0_0_24px_rgba(60,35,15,0.45),0_8px_24px_rgba(0,0,0,0.5)]"
      style={PARCHMENT_STYLE}
    >
      <SettingList
        look="setup"
        items={isGeneral ? GENERAL_GAME_SETUP : MEETING_GAME_SETUP}
        form={form}
        after={
          isGeneral ? (
            <RoleComposition look="setup" roleComposition={form.roleComposition} maxPlayers={form.ranges["max-players"]} />
          ) : null
        }
      />
    </div>
  )
}
