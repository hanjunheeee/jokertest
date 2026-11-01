// 추방 진행 표시: 확인 칸(추방·취소)·실패/결과 모름 글·결과 확인 버튼·다시 확인 중 안내
// KickSheet가 씀, 표시 조건·test id는 데스크톱 SettingKickPlayerModalContent와 같음
import { KICK_REQUEST_STATUS } from "@/domains/game/ingame/constants/ingameKick.js"
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { ERROR_ON_DARK_CLASS, SHEET_NOTE_CLASS } from "../../constants/matchingMobileStyles.js"

// 진행 표시 묶음
export default function KickStatus({
  targets, pendingTarget, status, errorCode, isSending, canLookupResult, isAwaitingResolution,
  onCancelConfirm, onConfirmKick, onLookupResult,
}) {
  return (
    <>
      {/* 고른 대상 있으면 확인 칸, 추방은 지금 목록을 같이 넘겨 다시 확인 */}
      {pendingTarget ? (
        <div
          role="alertdialog"
          aria-label="추방 확인"
          data-testid="kick-confirm"
          className="flex flex-col gap-2 rounded-lg border border-[#b50000]/60 bg-[#3a1410]/70 p-3"
        >
          <p className="text-center font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold text-[#f5f0e6]">
            <span data-testid="kick-confirm-target">{pendingTarget.nickname || pendingTarget.uuid}</span> 님을 추방할까요?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ImageButton
              look="fill"
              label="추방"
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              disabled={isSending}
              onClick={() => onConfirmKick?.(targets)}
              data-testid="kick-confirm-accept"
              className="h-11"
            />
            <ImageButton
              look="fill"
              label="취소"
              src={GAME_MATCHING_ASSETS.startGameButton}
              sfxKind="ui-cancel"
              onClick={() => onCancelConfirm?.()}
              data-testid="kick-confirm-cancel"
              className="h-11"
            />
          </div>
        </div>
      ) : null}

      {status === KICK_REQUEST_STATUS.FAILED ? (
        <p role="alert" data-testid="kick-error" className={ERROR_ON_DARK_CLASS}>{errorCode}</p>
      ) : null}
      {status === KICK_REQUEST_STATUS.UNKNOWN ? (
        <p role="alert" data-testid="kick-unknown" className={ERROR_ON_DARK_CLASS}>
          결과를 확인할 수 없습니다. 목록을 다시 확인한 뒤 새로 시도해주세요.
        </p>
      ) : null}
      {/* 결과 묻기 버튼은 성공 전까지만 */}
      {canLookupResult && status !== KICK_REQUEST_STATUS.SUCCEEDED ? (
        <button
          type="button"
          data-testid="kick-lookup-result"
          onClick={() => onLookupResult?.()}
          className="min-h-11 cursor-pointer rounded border border-[#c9b892]/60 bg-transparent px-3 font-bold text-[#f5f0e6]"
        >
          결과 확인
        </button>
      ) : null}
      {isAwaitingResolution ? (
        <p role="status" data-testid="kick-awaiting-resolution" className={`${SHEET_NOTE_CLASS} text-[#e6dcc8]`}>
          현재 참가자 목록을 서버에서 다시 확인하는 중입니다. 확인이 끝나야 새로 지목할 수 있습니다.
        </p>
      ) : null}
    </>
  )
}
