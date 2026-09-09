/**
 * 인게임 플레이어별 전적목록 패널.
 */
import SidePanel from "../SidePanel.jsx"
import PlayerRecordListContent from "./PlayerRecordListContent.jsx"

export default function PlayerRecordListPanel({ open, onClose }) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      ariaLabel="플레이어별 전적목록"
      closeAriaLabel="플레이어별 전적목록 닫기"
    >
      <PlayerRecordListContent />
    </SidePanel>
  )
}
