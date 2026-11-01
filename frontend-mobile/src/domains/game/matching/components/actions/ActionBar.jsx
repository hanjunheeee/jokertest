// 대기방 바닥 고정 줄: 안내 띠 + 준비·시작·삭제(방장) / 준비·나가기(참가자)
// GameMatchingPage가 ShellBottom 안에 넣어 씀, 버튼 글자·잠금 규칙은 데스크톱 MatchingPopupPanel과 같음
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import NoticeBanner from "./NoticeBanner.jsx"

// 바닥 줄 (page = useMatchingPage 값 묶음)
export default function ActionBar({ page }) {
  const {
    isHost, isReady, isSettingReady, isRoomVerified, isStarting,
    toggleReady, startGame, deleteRoom, handleBack,
    hasPendingSettingsResult, settingsError, verifyRoomSettingsResult,
    settingsOpen, settingsResultNotice, dismissSettingsResultNotice,
  } = page

  // 준비 버튼: 요청 중 / 준비취소 / 준비완료, 준비한 상태면 취소 그림
  const readyLabel = isSettingReady
    ? MATCHING_POPUP_COPY.readyPending
    : isReady ? MATCHING_POPUP_COPY.readyOff : MATCHING_POPUP_COPY.readyOn
  const readySrc = isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton
  // 요청 중이거나 방 확인 전이면 준비 잠금
  const readyDisabled = isSettingReady || !isRoomVerified

  // 결과 안내는 편집 중엔 가림 (데스크톱과 같음)
  const resultNotice = settingsOpen ? null : settingsResultNotice
  const hasResultNotice = typeof resultNotice === "string" && resultNotice.length > 0

  return (
    <div className="flex flex-col gap-2 border-t border-[#c9b892]/35 bg-black/90 px-3 pt-2 pb-2 land:flex-row land:items-center land:py-1.5">
      {hasPendingSettingsResult || hasResultNotice ? (
        <div className="flex flex-col gap-1.5 land:min-w-0 land:flex-1">
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

      <div
        className={`mx-auto grid w-full max-w-[34rem] gap-2 ${isHost ? "grid-cols-3" : "grid-cols-2"} land:max-w-[28rem]`}
      >
        <ImageButton look="fill" label={readyLabel} src={readySrc} onClick={toggleReady} disabled={readyDisabled} className="h-12 land:h-11" />
        {isHost ? (
          <>
            <ImageButton
              look="fill"
              label={isStarting ? MATCHING_POPUP_COPY.startingGame : MATCHING_POPUP_COPY.startGame}
              src={GAME_MATCHING_ASSETS.startGameButton}
              onClick={startGame}
              disabled={isStarting}
              className="h-12 land:h-11"
            />
            <ImageButton
              look="fill"
              label={MATCHING_POPUP_COPY.deleteRoom}
              src={GAME_MATCHING_ASSETS.deleteRoomButton}
              onClick={deleteRoom}
              className="h-12 land:h-11"
            />
          </>
        ) : (
          <ImageButton
            look="fill"
            label={MATCHING_POPUP_COPY.leaveRoom}
            src={GAME_MATCHING_ASSETS.deleteRoomButton}
            onClick={handleBack}
            className="h-12 land:h-11"
          />
        )}
      </div>
    </div>
  )
}
