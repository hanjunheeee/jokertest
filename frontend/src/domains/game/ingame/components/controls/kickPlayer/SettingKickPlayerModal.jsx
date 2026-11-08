// 설정 창의 판 추방 창: 대상 목록과 추방 진행 상태를 틀 안에 보여 줌
// 설정 창(SettingPanel)이 사용, 추방 동작은 useInGameKickFromCard 훅
import { useCallback, useContext, useEffect } from "react"
import { useInGameKickFromCard } from "../../../hooks/useInGameKickFromCard.js"
import { resolvePlayerRecordListProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { InGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import SettingKickPlayerModalContent from "./SettingKickPlayerModalContent.jsx"
import SettingKickPlayerModalShell from "./SettingKickPlayerModalShell.jsx"

// 추방 훅 값을 창 틀과 내용에 그대로 넘김
export default function SettingKickPlayerModal({ open, onClose }) {
  const kick = useInGameKickFromCard()
  // 보드 목록 없이 쓰여도(시험·미리보기) 안 터지게 컨텍스트를 직접 읽음
  const players = useContext(InGamePlayerSessionContext)?.players ?? null

  // 줄 사진은 보드 카드와 같은 사람 그림 (보드 목록에 없으면 내용 쪽 기본 그림)
  const getProfileAssetsByPlayerId = useCallback((uuid) => {
    if (!Array.isArray(players)) return null
    const index = players.findIndex((player) => player.id === uuid)
    return index >= 0 ? resolvePlayerRecordListProfileAssets(players[index], index) : null
  }, [players])

  // 창이 닫히면 추방 진행 상태를 처음으로 되돌림
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
        getProfileAssetsByPlayerId={getProfileAssetsByPlayerId}
      />
    </SettingKickPlayerModalShell>
  )
}
