import { useMemo } from "react"
import { MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import SetupTabContent from "./SetupTabContent.jsx"

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
