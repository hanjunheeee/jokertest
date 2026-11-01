// 설정 탭 본문: 항목 줄(숫자·체크), 일반 탭이면 뒤에 역할 구성
// SettingsEditSheet가 씀, 숨길 항목 규칙은 데스크톱 General/MeetingGameSetupTab과 같음 (useSetupForm hiddenIds)
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import RoleComposition from "@m/domains/game/shared/settings/RoleComposition.jsx"
import SettingList from "@m/domains/game/shared/settings/SettingList.jsx"

// 탭 본문 (form = useSetupForm 값)
export default function SettingsItemList({ activeTab, form }) {
  const isGeneral = activeTab === "general"

  return (
    <SettingList
      look="sheet"
      items={isGeneral ? GENERAL_GAME_SETUP : MEETING_GAME_SETUP}
      form={form}
      after={
        isGeneral ? (
          <RoleComposition look="sheet" roleComposition={form.roleComposition} maxPlayers={form.ranges["max-players"]} />
        ) : null
      }
    />
  )
}
