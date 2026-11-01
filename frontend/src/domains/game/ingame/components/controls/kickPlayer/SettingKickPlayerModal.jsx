// 설정 창의 판 추방 창: 대상 목록과 추방 진행 상태를 틀 안에 보여 줌
// 설정 창(SettingPanel)이 띄움, 추방 동작은 카드 추방 훅(useInGameKickFromCard)을 같이 씀
import { useEffect } from "react"
import { useInGameKickFromCard } from "../../../hooks/useInGameKickFromCard.js"
import SettingKickPlayerModalContent from "./SettingKickPlayerModalContent.jsx"
import SettingKickPlayerModalShell from "./SettingKickPlayerModalShell.jsx"

export default function SettingKickPlayerModal({ open, onClose }) {
  const kick = useInGameKickFromCard()

  // 창이 닫히면 추방 진행 상태를 처음으로
  useEffect(() => {
    if (!open) kick.reset()
  }, [open, kick.reset])

  return (
    <SettingKickPlayerModalShell open={open} onClose={onClose}>
      <SettingKickPlayerModalContent
        targets={kick.targets}
        pendingTarget={kick.pendingTarget}
        status={kick.status}
        errorCode={kick.errorCode}
        isSending={kick.isSending}
        canLookupResult={kick.canLookupResult}
        isAwaitingResolution={kick.isAwaitingResolution}
        onRequestConfirm={kick.requestConfirm}
        onCancelConfirm={kick.cancelConfirm}
        onConfirmKick={kick.confirmKick}
        onLookupResult={kick.lookupResult}
      />
    </SettingKickPlayerModalShell>
  )
}
