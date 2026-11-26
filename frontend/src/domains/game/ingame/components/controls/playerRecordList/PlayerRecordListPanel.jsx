// 플레이어 전적 목록 옆 창 (옆 창 틀 + 목록 내용)
// InGamePage가 사용, 열림 여부는 useInGameSidePanel 값으로 받음
import SidePanel from "../SidePanel.jsx"
import PlayerRecordListContent from "./PlayerRecordListContent.jsx"

// 옆 창 틀에 전적 목록 내용을 끼우고 화면 잠금 신호를 전달함
export default function PlayerRecordListPanel({ open, onClose, interactionLocked = false }) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      ariaLabel="플레이어별 전적목록"
      closeAriaLabel="플레이어별 전적목록 닫기"
    >
      <PlayerRecordListContent interactionLocked={interactionLocked} />
    </SidePanel>
  )
}
