// 회의&투표 탭 내용 (낮 토론·투표·밤 시간·직업별 밤 시간·투표 공개)
// GameSetupPanel이 씀, 편집 모드면 숨길 항목을 hiddenItemIds로 받음
import { useMemo } from "react"
import { MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import SetupTabContent from "./SetupTabContent.jsx"

// 회의&투표 탭
export default function MeetingGameSetupTab({ checks, ranges, setCheck, setRange, hiddenItemIds }) {
  // 숨길 항목 빼고 그림
  const items = useMemo(() => {
    if (!hiddenItemIds || hiddenItemIds.length === 0) return MEETING_GAME_SETUP
    const hidden = new Set(hiddenItemIds)
    return MEETING_GAME_SETUP.filter((item) => !hidden.has(item.id))
  }, [hiddenItemIds])

  return (
    <SetupTabContent
      items={items}
      checks={checks}
      ranges={ranges}
      setCheck={setCheck}
      setRange={setRange}
    />
  )
}
