// 대기방 바닥 줄: 안내 띠 + 시작이 잠긴 까닭 글 + 준비·시작·삭제(방장) / 준비·나가기(참가자)
// GameMatchingPage가 ShellBottom 안에 넣어 씀, 버튼 글자·그림·순서·잠금은 데스크톱 MatchingPopupPanel 아래 버튼 줄과 같음
import { useId } from "react"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import NoticeBanner from "./NoticeBanner.jsx"
import { ACTION_BUTTON_LOOK } from "../../constants/matchingMobileStyles.js"

// 준비 버튼 글: 요청 중 / 준비취소 / 준비완료
function readyLabelOf(isSettingReady, isReady) {
  if (isSettingReady) return MATCHING_POPUP_COPY.readyPending
  if (isReady) return MATCHING_POPUP_COPY.readyOff
  return MATCHING_POPUP_COPY.readyOn
}

// 시작 단추가 꺼진 까닭 글: 어두운 바탕에 밝은 글자 (전역 p 글자색이 검정이라 색을 직접 줌), 가로 화면에선 버튼 줄 왼쪽
const START_LOCKED_REASON_CLASS =
  "rounded-sm border border-[#3a2818]/70 bg-[#120a06]/85 px-2 py-1 text-center font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold leading-snug text-[#f5f0e6] land:min-w-0 land:flex-1"

// 바닥 줄 (page = useMatchingPage 값 묶음)
export default function ActionBar({ page }) {
  const startReasonId = useId()
  const {
    isHost, isReady, isSettingReady, isRoomVerified, isStarting, startLockedReason,
    toggleReady, startGame, deleteRoom, handleBack,
    hasPendingSettingsResult, settingsError, verifyRoomSettingsResult,
    settingsOpen, settingsResultNotice, dismissSettingsResultNotice,
  } = page

  // 준비 버튼: 요청 중 / 준비취소 / 준비완료, 준비한 상태면 취소 그림
  const readyLabel = readyLabelOf(isSettingReady, isReady)
  const readySrc = isReady ? GAME_MATCHING_ASSETS.deleteRoomButton : GAME_MATCHING_ASSETS.startGameButton
  // 요청 중이거나 방 확인 전이면 준비 잠금
  const readyDisabled = isSettingReady || !isRoomVerified

  // 결과 안내는 편집 중엔 가림 (데스크톱과 같음)
  const resultNotice = settingsOpen ? null : settingsResultNotice
  const hasResultNotice = typeof resultNotice === "string" && resultNotice.length > 0
  // 시작이 잠긴 까닭 글은 방장에게만 (인원 모자람·준비 안 됨)
  const showStartReason = Boolean(isHost && startLockedReason)

  return (
    <div className="flex flex-col gap-2 px-3 pt-2 pb-2 land:flex-row land:items-center land:py-1.5">
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
