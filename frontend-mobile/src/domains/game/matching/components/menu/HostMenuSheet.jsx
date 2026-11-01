// 방장 메뉴 시트: 방 설정 변경·참가자 추방
// GameMatchingPage가 씀, 데스크톱 왼쪽 위 방장 버튼 줄(MatchingHostActionButtons)을 ⋯ 메뉴로 옮김
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { ROOM_MENU_COPY, SHEET_NOTE_CLASS } from "../../constants/matchingMobileStyles.js"

// 방장 메뉴 (고르면 메뉴 닫고 그 창 엶)
export default function HostMenuSheet({
  open,
  onClose,
  canEditSettings,
  isKickHost,
  canKick,
  onOpenSettings,
  onOpenKickModal,
}) {
  // 고른 뒤 메뉴 닫고 다음 시트 엶
  const pick = (action) => () => {
    onClose()
    action()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={ROOM_MENU_COPY.title}>
      <div className="flex flex-col gap-3 pt-2 pb-1">
        {/* 설정 변경: 편집 자격 있을 때만 */}
        {canEditSettings ? (
          <ImageButton
            look="fill"
            label={MATCHING_POPUP_COPY.changeRoomSettings}
            src={GAME_MATCHING_ASSETS.startGameButton}
            onClick={pick(onOpenSettings)}
            className="h-12 w-full"
          />
        ) : null}
        {/* 추방: 방장이면 보이되 방 확인 전엔 잠그고 이유 글 */}
        {isKickHost ? (
          <>
            <ImageButton
              look="fill"
              label={MATCHING_POPUP_COPY.kickParticipant}
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              onClick={canKick ? pick(onOpenKickModal) : undefined}
              disabled={!canKick}
              className="h-12 w-full"
            />
            {canKick ? null : (
              <p role="status" className={`${SHEET_NOTE_CLASS} text-center text-[#e6dcc8]/80`}>
                {ROOM_MENU_COPY.kickLockedHint}
              </p>
            )}
          </>
        ) : null}
      </div>
    </BottomSheet>
  )
}
