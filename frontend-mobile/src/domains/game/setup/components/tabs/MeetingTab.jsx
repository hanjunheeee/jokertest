// 회의&투표 탭 (낮 토론·투표·밤 시간·직업별 밤 시간·투표 공개)
// SetupPanel이 씀
import { MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import SetupList from "../SetupList.jsx"

// 회의&투표 탭 목록
export default function MeetingTab({ form }) {
  return (
    <SetupList
      items={MEETING_GAME_SETUP}
      hiddenIds={form.hiddenIds}
      checks={form.checks}
      ranges={form.ranges}
      setCheck={form.setCheck}
      setRange={form.setRange}
    />
  )
}
