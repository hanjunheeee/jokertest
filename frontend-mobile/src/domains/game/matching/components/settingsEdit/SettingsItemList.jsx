// 설정 탭 본문: 양피지 위 항목 줄(숫자·체크), 일반 탭이면 뒤에 역할 구성
// SettingsEditSheet가 씀, 숨길 항목 규칙은 데스크톱 General/MeetingGameSetupTab과 같음 (useSetupForm hiddenIds)
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import RoleComposition from "@m/domains/game/shared/settings/RoleComposition.jsx"
import SettingList from "@m/domains/game/shared/settings/SettingList.jsx"
import SetupSettingsScrollArea from "@m/domains/game/shared/settings/SetupSettingsScrollArea.jsx"
import { PARCHMENT_STYLE } from "../../constants/settingsEditStyle.js"

// 탭 본문 (form = useSetupForm 값), 탭을 바꾸면 scrollKey로 스크롤 맨 위
export default function SettingsItemList({ activeTab, form }) {
  const isGeneral = activeTab === "general"

  return (
    <SetupSettingsScrollArea scrollKey={activeTab} parchmentStyle={PARCHMENT_STYLE}>
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
    </SetupSettingsScrollArea>
  )
}
