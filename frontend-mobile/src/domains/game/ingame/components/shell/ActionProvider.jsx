// 인게임 행동 Provider: 행동 패널 값·방장·카드 추방 열기를 InGameActionContext로 나눠 줌
// InGamePage가 씀, 데스크톱 InGamePage의 InGameActionProvider를 옮기고 추방 창만 모바일 시트로 바꿈
import { useCallback, useState } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useInGameActionPanel } from "@/domains/game/ingame/hooks/useInGameActionPanel.js"
import { useInGameKickFromCard } from "@/domains/game/ingame/hooks/useInGameKickFromCard.js"
import KickSheet from "./KickSheet.jsx"

// 다시 열기 버튼 (추방 결과를 아직 못 봤을 때만, 행동 줄 위 오른쪽)
const REOPEN_CLASS =
  "absolute right-2 bottom-2 z-30 min-h-11 rounded-lg border border-[#c9b892]/60 bg-black/75 px-3 font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold text-[#f5f0e6]"

// 카드 메뉴가 추방을 누르면 확인 시트를 엶 (데스크톱과 같은 열기·닫기 순서)
export default function ActionProvider({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })

  const hostUuid = useInGameStore((s) => s.hostUuid ?? null)
  const kick = useInGameKickFromCard()
  const [isKickDialogOpen, setIsKickDialogOpen] = useState(false)
  const { requestConfirmByUuid, cancelConfirm } = kick

  const openKickConfirm = useCallback((uuid) => {
    setIsKickDialogOpen(true)
    requestConfirmByUuid(uuid)
  }, [requestConfirmByUuid])

  const closeKickDialog = useCallback(() => {
    cancelConfirm()
    setIsKickDialogOpen(false)
  }, [cancelConfirm])

  const actionContextValue = {
    ...actionPanelValue,
    hostUuid,
    isSending: kick.isSending,
    requestConfirmByUuid: openKickConfirm,
  }

  const canReopen = !isKickDialogOpen && (kick.canLookupResult || kick.isSending || kick.isAwaitingResolution)

  return (
    <InGameActionContext.Provider value={actionContextValue}>
      {children}
      <KickSheet open={isKickDialogOpen} kick={kick} onClose={closeKickDialog} />
      {canReopen ? (
        <button type="button" className={REOPEN_CLASS} onClick={() => setIsKickDialogOpen(true)}>
          추방 결과 조회
        </button>
      ) : null}
    </InGameActionContext.Provider>
  )
}
