// 설정의 판 추방 창: 공용 투표 창 틀 + 안내 글·진행 표시·대상 목록 (설정 시트 위 가운데)
// SettingsSheet가 씀, 추방 동작은 데스크톱 useInGameKickFromCard 그대로 (SettingKickPlayerModal과 같음)
import { useEffect } from "react"
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGameKickFromCard } from "@/domains/game/ingame/hooks/useInGameKickFromCard.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import { NOTICE_CLASS, SUBTITLE_CLASS } from "@m/shared/ui/modal/voteFrameStyle.js"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"

// 추방 훅 값을 창에 그대로 그림
export default function KickSheet({ open, onClose }) {
  const kick = useInGameKickFromCard()
  const { targets, pendingTarget, isSending, reset } = kick

  // 창이 닫히면 추방 진행 상태를 처음으로 되돌림
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  return (
    <VoteFrameModal
      open={open}
      onClose={onClose}
      title={COPY.title}
      closeLabel={COPY.closeAriaLabel}
      testId="kick-sheet"
    >
      <p className={SUBTITLE_CLASS}>{COPY.subtitle}</p>
      <p className={NOTICE_CLASS}>{COPY.notice}</p>

      <KickStatus
        targets={targets}
        pendingTarget={pendingTarget}
        status={kick.status}
        errorCode={kick.errorCode}
        isSending={isSending}
        canLookupResult={kick.canLookupResult}
        isAwaitingResolution={kick.isAwaitingResolution}
        onCancelConfirm={kick.cancelConfirm}
        onConfirmKick={kick.confirmKick}
        onLookupResult={kick.lookupResult}
      />

      {targets.length === 0 ? (
        <p role="status" data-testid="kick-empty-targets" className={`${NOTICE_CLASS} py-3`}>
          {COPY.emptyTargets}
        </p>
      ) : null}

      <ul aria-label={COPY.listAriaLabel} className="flex flex-col gap-1.5">
        {targets.map((player, index) => {
          // 프로필 그림은 줄 순서대로 기본 그림을 돌려 씀 (데스크톱과 같음)
          const { profilePhotoSrc, profileBorderSrc } = getPlayerRecordListFallbackProfileAssets(index)
          return (
            <KickRow
              key={player.membershipId ?? player.uuid}
              name={player.nickname}
              profilePhotoSrc={profilePhotoSrc}
              profileBorderSrc={profileBorderSrc}
              isPending={pendingTarget?.membershipId === player.membershipId}
              disabled={isSending}
              onKick={() => kick.requestConfirm?.(player)}
            />
          )
        })}
      </ul>
    </VoteFrameModal>
  )
}
