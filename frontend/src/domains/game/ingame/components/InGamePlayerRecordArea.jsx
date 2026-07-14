import { useState } from "react"
import InGameTopControls from "./controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "./controls/playerRecordList/PlayerRecordListPanel.jsx"

/** 좌측 상단 버튼과 플레이어별 전적목록 패널을 한곳에서 관리합니다. */
export default function InGamePlayerRecordArea() {
  // 플레이어별 전적목록 패널이 열려 있는지 표시합니다.
  const [playerRecordListOpen, setPlayerRecordListOpen] = useState(false)

  return (
    <>
      <InGameTopControls onMenuClick={() => setPlayerRecordListOpen(true)} />
      <PlayerRecordListPanel
        open={playerRecordListOpen}
        onClose={() => setPlayerRecordListOpen(false)}
      />
    </>
  )
}
