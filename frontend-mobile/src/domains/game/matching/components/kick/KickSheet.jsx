// 참가자 추방 창: 투표 창 틀 + 안내 글·진행 표시·대상 목록
// GameMatchingPage가 씀, 값·동작은 데스크톱 useMatchingRoomKick 그대로 (데스크톱 SettingKickPlayerModal과 같은 틀·글)
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import VoteFrameModal from "../frame/VoteFrameModal.jsx"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"
import { NOTICE_CLASS, SUBTITLE_CLASS } from "../../constants/voteFrameStyle.js"

// 추방 창 (page = useMatchingPage 값 묶음)
export default function KickSheet({ page }) {
  const {
    kickModalOpen, closeKickModal, kickTargets: targets, kickPendingTarget: pendingTarget,
    kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, cancelKickConfirm, confirmKick, lookupKickResult,
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
        targets={targets}
        pendingTarget={pendingTarget}
        status={kickStatus}
        errorCode={kickErrorCode}
        isSending={isKicking}
        canLookupResult={canLookupKickResult}
        isAwaitingResolution={isAwaitingKickResolution}
        onCancelConfirm={cancelKickConfirm}
        onConfirmKick={confirmKick}
        onLookupResult={lookupKickResult}
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
              disabled={isKicking}
              onKick={() => requestKickConfirm?.(player)}
            />
          )
        })}
      </ul>
    </VoteFrameModal>
  )
}
