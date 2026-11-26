// 참가자 추방 창: 투표 창 틀 + 안내 글·진행 표시·대상 목록, 줄 단추 한 번으로 즉시 추방함
// GameMatchingPage가 사용, 값·동작은 데스크톱 useMatchingRoomKick에서 받음
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { resolvePlayerRecordListProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"
import { NOTICE_CLASS, SUBTITLE_CLASS } from "@m/shared/ui/modal/voteFrameStyle.js"

// 추방 창 (page = useMatchingPage 값 묶음)
export default function KickSheet({ page }) {
  const {
    kickModalOpen, closeKickModal, kickTargets: targets, kickPendingTarget: pendingTarget,
    kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, lookupKickResult,
  } = page

  return (
    <VoteFrameModal
      open={kickModalOpen}
      onClose={closeKickModal}
      title={COPY.title}
      closeLabel={COPY.closeAriaLabel}
      testId="kick-sheet"
    >
      <p className={SUBTITLE_CLASS}>{COPY.subtitle}</p>
      <p className={NOTICE_CLASS}>{COPY.notice}</p>

      <KickStatus
        status={kickStatus}
        errorCode={kickErrorCode}
        canLookupResult={canLookupKickResult}
        isAwaitingResolution={isAwaitingKickResolution}
        onLookupResult={lookupKickResult}
      />

      {targets.length === 0 ? (
        <p role="status" data-testid="kick-empty-targets" className={`${NOTICE_CLASS} py-3`}>
          {COPY.emptyTargets}
        </p>
      ) : null}

      <ul aria-label={COPY.listAriaLabel} className="flex flex-col gap-1.5">
        {targets.map((player, index) => {
          // 그 사람 사진·테두리, 없을 때만 줄 순서 기본 그림 사용
          const { profilePhotoSrc, profileBorderSrc } = resolvePlayerRecordListProfileAssets(player, index)
          // 소속 id가 둘 다 있을 때만 소속 id로 비교, 없으면 uuid로 비교함
          const isPending = Boolean(pendingTarget) && (
            pendingTarget.membershipId && player.membershipId
              ? pendingTarget.membershipId === player.membershipId
              : pendingTarget.uuid === player.uuid
          )
          return (
            <KickRow
              key={player.membershipId ?? player.uuid}
              name={player.nickname}
              profilePhotoSrc={profilePhotoSrc}
              profileBorderSrc={profileBorderSrc}
              isPending={isPending}
              disabled={isKicking}
              onKick={() => requestKickConfirm?.(player)}
            />
          )
        })}
      </ul>
    </VoteFrameModal>
  )
}
