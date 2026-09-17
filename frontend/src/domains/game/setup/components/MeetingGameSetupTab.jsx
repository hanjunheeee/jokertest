/**
 * 인게임 설정 "회의&투표" 탭 본문
 * MEETING_GAME_SETUP 항목을 SetupTabContent에 넘김
 */
import { useMemo } from "react"
import { MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import SetupTabContent from "./SetupTabContent.jsx"

/**
 * 회의&투표 탭 설정 목록(토론·투표·밤 행동 시간·투표 공개 등)
 * @param {string[]} [hiddenItemIds] - F-20 편집 모드에서 그리지 않을 항목 id(D-12의 추가 규칙).
 */
export default function MeetingGameSetupTab({ checks, ranges, setCheck, setRange, hiddenItemIds }) {
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
