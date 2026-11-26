// 대기방 매칭 틀 바로 아래: 안내 띠·시작 잠김 까닭 글 + 준비·시작·삭제(방장) / 준비·나가기(참가자)
// GameMatchingPage가 MatchingBoard 아래에 사용, 단추 글자·잠금 조건은 데스크톱 MatchingPopupPanel과 같음
import { useId } from "react"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import NoticeBanner from "./NoticeBanner.jsx"
import { ACTION_BUTTON_LOOK, START_LOCKED_REASON_CLASS } from "../../constants/matchingMobileStyles.js"

// 준비 단추 글: 요청 중 / 준비취소 / 준비완료
function readyLabelOf(isSettingReady, isReady) {
  if (isSettingReady) return MATCHING_POPUP_COPY.readyPending
  if (isReady) return MATCHING_POPUP_COPY.readyOff
  return MATCHING_POPUP_COPY.readyOn
}

// 틀 아래 단추 줄 (page = useMatchingPage 값 묶음)
export default function ActionBar({ page }) {
  const startReasonId = useId()
  const {
    isHost, isReady, isSettingReady, isRoomVerified, isStarting, startLockedReason,
    toggleReady, startGame, deleteRoom, handleBack,
    hasPendingSettingsResult, settingsError, verifyRoomSettingsResult,
    settingsOpen, settingsResultNotice, dismissSettingsResultNotice,
  } = page

  const showStartReason = Boolean(isHost && startLockedReason)
  const readyLabel = readyLabelOf(isSettingReady, isReady)
  const readySrc = isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton
  const readyDisabled = isSettingReady || !isRoomVerified

  // 결과 안내는 편집 중엔 가림
  const resultNotice = settingsOpen ? null : settingsResultNotice
  const hasResultNotice = typeof resultNotice === "string" && resultNotice.length > 0

  return (
    <div className="mt-1.5 flex w-full max-w-[40rem] flex-col gap-1.5 px-1 pt-0.5 pb-0 land:mt-1 land:max-w-[min(100%,calc((100svh-9.75rem)*1.354))]">
      {hasPendingSettingsResult || hasResultNotice ? (
        <div className="flex flex-col gap-1.5">
          {hasPendingSettingsResult ? (
            <NoticeBanner
              message={settingsError?.message ?? "저장 결과를 확인하는 중입니다."}
              actionLabel="결과 확인"
              actionAriaLabel="설정 저장 결과 확인"
              onAction={verifyRoomSettingsResult}
            />
          ) : null}
          {hasResultNotice ? (
            <NoticeBanner
              role="alert"
              ariaLabel="설정 저장 결과 안내"
              message={resultNotice}
              actionLabel="확인"
              actionAriaLabel="설정 저장 결과 안내 닫기"
              onAction={dismissSettingsResultNotice}
            />
          ) : null}
        </div>
      ) : null}

      {showStartReason ? (
        <p id={startReasonId} role="status" data-testid="start-locked-reason" className={START_LOCKED_REASON_CLASS}>
          {startLockedReason}
        </p>
      ) : null}

      <div
        className={`mx-auto grid w-full max-w-[34rem] gap-2 ${isHost ? "grid-cols-3" : "grid-cols-2"} land:max-w-[28rem]`}
      >
        <ImageButton look={ACTION_BUTTON_LOOK} label={readyLabel} src={readySrc} onClick={toggleReady} disabled={readyDisabled} />
        {isHost ? (
          <>
            <ImageButton
              look={ACTION_BUTTON_LOOK}
              label={isStarting ? MATCHING_POPUP_COPY.startingGame : MATCHING_POPUP_COPY.startGame}
              src={GAME_MATCHING_ASSETS.startGameButton}
              onClick={startGame}
              disabled={isStarting || showStartReason}
              aria-describedby={showStartReason ? startReasonId : undefined}
            />
            <ImageButton
              look={ACTION_BUTTON_LOOK}
              label={MATCHING_POPUP_COPY.deleteRoom}
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              onClick={deleteRoom}
            />
          </>
        ) : (
          <ImageButton
            look={ACTION_BUTTON_LOOK}
            label={MATCHING_POPUP_COPY.leaveRoom}
            src={GAME_MATCHING_ASSETS.deleteRoomButton}
            onClick={handleBack}
          />
        )}
      </div>
    </div>
  )
}
