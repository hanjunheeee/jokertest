// 참가자 추방 시트: 안내 글·진행 표시·대상 목록
// GameMatchingPage가 씀, 값·동작은 데스크톱 useMatchingRoomKick 그대로 받아 그리기만 함
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"
import { SHEET_NOTE_CLASS } from "../../constants/matchingMobileStyles.js"

// 추방 시트 (page = useMatchingPage 값 묶음)
export default function KickSheet({ page }) {
  const {
    kickModalOpen, closeKickModal, kickTargets: targets, kickPendingTarget: pendingTarget,
    kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, cancelKickConfirm, confirmKick, lookupKickResult,
  } = page

  return (
    <BottomSheet open={kickModalOpen} onClose={closeKickModal} title={COPY.title} closeLabel={COPY.closeAriaLabel}>
      <div className="flex flex-col gap-2 pt-1">
        <p className={`${SHEET_NOTE_CLASS} text-center font-bold text-[#f5f0e6]`}>{COPY.subtitle}</p>
        <p className={`${SHEET_NOTE_CLASS} text-center text-[#e6dcc8]/80`}>{COPY.notice}</p>

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
          <p role="status" data-testid="kick-empty-targets" className={`${SHEET_NOTE_CLASS} py-4 text-center text-[#e6dcc8]`}>
            {COPY.emptyTargets}
          </p>
        ) : null}

        <ul aria-label={COPY.listAriaLabel} className="flex flex-col">
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
      </div>
    </BottomSheet>
  )
}
