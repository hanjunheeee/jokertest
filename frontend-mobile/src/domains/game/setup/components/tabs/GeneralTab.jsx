// 일반 탭 (코드로만 참가·최대 인원·광대 수·불 꺼진 무도회·영혼의 베팅)
// SetupPanel이 씀
import { GENERAL_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import SetupList from "../SetupList.jsx"

// 일반 탭 목록
export default function GeneralTab({ form }) {
  return (
    <SetupList
      items={GENERAL_GAME_SETUP}
      hiddenIds={form.hiddenIds}
      checks={form.checks}
      ranges={form.ranges}
      setCheck={form.setCheck}
      setRange={form.setRange}
    />
  )
}
