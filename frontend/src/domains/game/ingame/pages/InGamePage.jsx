// 인게임 화면 전체 (카드 판·채팅·시간 바·알림 창 모음)
// 경로 /ingame이 씀
import { useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import InGameBackground from "../components/InGameBackground.jsx"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import { InGameChatSessionProvider } from "../components/chat/InGameChatSessionProvider.jsx"
import InGameRoleRevealOverlay from "../components/roleReveal/InGameRoleRevealOverlay.jsx"
import InGamePhaseEntranceOverlay from "../components/phaseEntrance/InGamePhaseEntranceOverlay.js"
import InGameNightTurnAnnouncementOverlay from "../components/nightTurn/InGameNightTurnAnnouncementOverlay.jsx"
import InGameNightPrivateResultOverlay from "../components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx"
import InGameDawnReport from "../components/dawnReport/InGameDawnReport.jsx"
import InGameDeadParticipantChoice from "../components/deadChoice/InGameDeadParticipantChoice.jsx"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import { InGameActionContext } from "../context/InGameActionContext.jsx"
import InGameTopControls from "../components/controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "../components/controls/playerRecordList/PlayerRecordListPanel.jsx"
import SettingPanel from "../components/controls/ingameSetting/SettingPanel.jsx"
import InGameVoteStatusPanel from "../components/vote/InGameVoteStatusPanel.jsx"
import InGameTimebar from "../components/timebar/InGameTimebar.jsx"
import InGameCornerActionPanel from "../components/actions/InGameCornerActionPanel.jsx"
import InGameTribunalPresentationGate from "../components/tribunalPresentation/InGameTribunalPresentationGate.jsx"
import InGameTribunalExpulsionOverlay from "../components/tribunalExpulsion/InGameTribunalExpulsionOverlay.jsx"
import InGameInviteNotice from "../components/inviteNotice/InGameInviteNotice.jsx"
import InGameEntryPreparingOverlay from "../components/entryPreparing/InGameEntryPreparingOverlay.jsx"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import {
  getIdentityScopeVersion,
  selectDawnReport,
  subscribeIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { selectInGameTimebarPhaseDeadline } from "../utils/timebar/phaseDeadline.js"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "../utils/selectInGameSessionGuard.js"
import { selectInGameTimebarStatusLabel } from "../utils/selectInGameTimebarStatusMessage.js"
import { selectInGameDeadParticipantChoice } from "../utils/selectInGameDeadParticipantChoice.js"
import { selectInGameSelfAlive } from "../utils/selfAlive.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameExit } from "../hooks/useInGameExit.js"
import {
  useInGameSessionSnapshotSync,
  useInGameSnapshotRebindPending,
} from "../hooks/useInGameSessionSnapshotSync.js"
import { useInGameNightPrivateResult } from "../hooks/useInGameNightPrivateResult.js"
import { useInGameOverlayStack } from "../hooks/useInGameOverlayStack.js"
import { useInGameTribunalExpulsionPresentation } from "../hooks/useInGameTribunalExpulsionPresentation.js"
import { useInGameResultNavigation } from "../hooks/useInGameResultNavigation.js"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"
import { useInGameActionPanel } from "../hooks/useInGameActionPanel.js"
import { useTurnProgress } from "../hooks/timebar/useTurnProgress.js"
import { useTimerPlacement } from "../hooks/timebar/useTimerPlacement.js"

// 판 조작 값(행동 줄·카드 메뉴·재판 연출이 같이 봄)을 컨텍스트로 넣음
// 카드에서 여는 추방 창은 열 길이 없어 걷어 냄 (판 안에는 추방 길 없음, 추방 창은 대기방만 씀)
export function InGameActionProvider({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })
  const hostUuid = useInGameStore((s) => s.hostUuid ?? null)

  const actionContextValue = {
    ...actionPanelValue,
    hostUuid,
  }

  return (
    <InGameActionContext.Provider value={actionContextValue}>
      {children}
    </InGameActionContext.Provider>
  )
}

export default function InGamePage() {
  const sidePanel = useInGameSidePanel()
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  const {
    requestExit, retryExit, resolveExitOutcome, exitStatus, exitErrorCode, exitAttemptId,
  } = useInGameExit()
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
  const choiceScopeKey = `${authUuid}|${identityGeneration}|${gameId}|${identityScopeVersion}`
  const [keepWatchingScope, setKeepWatchingScope] = useState(null)
  const keepWatchingChosen = keepWatchingScope !== null && keepWatchingScope === choiceScopeKey
  const snapshotSyncStatus = useInGameSessionSnapshotSync()
  const identityRebindPending = useInGameSnapshotRebindPending()
  const tribunalExpulsion = useInGameTribunalExpulsionPresentation({
    hold: false,
  })
  const expulsionBusy = tribunalExpulsion.open || tribunalExpulsion.pending

  // 낮 시작 연출 (밤에 죽은 사람·아무 일도 없음): 남아 있으면 pending, 추방 영상이 끝난 뒤 열림
  // 차례: 낮 시작 연출 → "낮이 되었습니다"·밤 개인 결과, 판이 끝났으면 연출 → 결과 화면
  const dawnReport = useInGameStore(selectDawnReport)
  const dawnReportPending = dawnReport !== null
  const dawnReportOpen = dawnReportPending && !expulsionBusy
  const finishDawnReport = () => {
    if (dawnReport) useInGameStore.getState().finishDawnReport(dawnReport.key)
  }

  const {
    roleReveal,
    phaseEntrance,
    nightTurn,
    entryPreparingActive,
    interactionBlocked,
  } = useInGameOverlayStack({
    deathRevealActive: expulsionBusy,
    dawnReportActive: dawnReportPending,
  })

  // 밤인 동안도 미룸: 서버가 내 결과를 밤 결과(낮 시작 연출)보다 먼저 보내서, 그 틈에 창이 한 번 그려졌다
  // 연출에 가려 닫히고 연출 뒤 다시 떠 밤마다 두 번 뜸 → 밤 결과가 들어와 낮이 된 뒤 연출 다음에 한 번만
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || expulsionBusy || dawnReportPending || gameState?.phase === "NIGHT",
  })

  // 결과 화면 이동은 추방 영상·낮 시작 연출이 끝난 뒤로 미룸 (밤 암살로 판이 끝나면 연출 뒤 결과 화면)
  useInGameResultNavigation({
    hold: identityRebindPending || expulsionBusy || dawnReportPending,
  })

  const needsDeadChoice = selectInGameDeadParticipantChoice(gameState, authUuid) && !keepWatchingChosen
  // 산 사람이 나가기에 실패해도 이 창이 열려서 사망 글은 죽은 사람에게만
  const selfDead = selectInGameSelfAlive(gameState) === false

  const exitRecoveryKey = `${choiceScopeKey}|${exitAttemptId}`
  const [acknowledgedExitRecovery, setAcknowledgedExitRecovery] = useState(null)
  const needsExitRecovery = exitStatus !== "idle" && acknowledgedExitRecovery !== exitRecoveryKey

  const handleKeepWatching = () => {
    setKeepWatchingScope(choiceScopeKey)
    setAcknowledgedExitRecovery(exitRecoveryKey)
  }

  const deadChoiceOpen = (needsDeadChoice || needsExitRecovery)
    && !roleReveal.open
    && !dawnReportPending
    && !nightPrivateResult.open

  const tribunalPresentationOpen =
    gameState?.phase === "TRIBUNAL"
    && Boolean(gameState?.tribunal?.defendantUuid)
    && gameState.tribunal.resolved !== true

  const surfaceLocked =
    interactionBlocked || nightPrivateResult.open || deadChoiceOpen
    || dawnReportOpen
    || tribunalPresentationOpen || tribunalExpulsion.open

  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const timebarStatusLabel = selectInGameTimebarStatusLabel(gameState)
  const { remainingRatio, remainingSec } = useTurnProgress(phaseTurnDeadline)
  const { timerPlacement, setTimerPlacement } = useTimerPlacement()

  const isValidGameSession = isValidInGameSession(gameId, gameState)

  useEffect(() => {
    if (!shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState })) return
    navigate("/multiplay", { replace: true })
  }, [gameId, gameState, navigate, snapshotSyncStatus])

  if (!isValidGameSession) return null

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <InGameBackground />

      <InGamePlayerSessionProvider>
        <InGameChatSessionProvider>
        <InGameActionProvider interactionBlocked={interactionBlocked}>
          <div
            className={`absolute inset-0 ${surfaceLocked ? "pointer-events-none" : ""}`.trim()}
            inert={surfaceLocked || undefined}
          >
            <InGameTopControls
              onExitClick={requestExit}
              onMenuClick={sidePanel.openRecords}
              onSettingsClick={sidePanel.openSettings}
              onOpenRoleReveal={roleReveal.reopen}
              roleRevealAvailable={Boolean(roleReveal.roleInfo)}
            />
            <InGameTimebar
              day={gameState?.dayIndex}
              activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
              statusLabel={timebarStatusLabel}
              phaseTurnDeadline={phaseTurnDeadline}
              timerPlacement={timerPlacement}
              remainingRatio={remainingRatio}
              remainingSec={remainingSec}
              showResourcesWithoutLabel={entryPreparingActive}
            />
            <InGameCornerActionPanel onVoteStatusClick={() => setVoteStatusOpen(true)} />
            <InGamePlayerBoard />
            {/* 단계 안내(잠그는 것만)·밤 차례 창이 뜨면 크게 보기를 닫게 알림: 크게 보기가 그 창보다 위에 떠서 글과 단추를 가림 */}
            <InGameChatShell
              timerPlacement={timerPlacement}
              statusLabel={timebarStatusLabel}
              remainingRatio={remainingRatio}
              remainingSec={remainingSec}
              coverOverlayOpen={interactionBlocked || nightTurn.open}
            />
            <PlayerRecordListPanel
              open={sidePanel.recordsOpen}
              onClose={sidePanel.close}
            />
            <SettingPanel
              open={sidePanel.settingsOpen}
              onClose={sidePanel.close}
              timerPlacement={timerPlacement}
              onTimerPlacementChange={setTimerPlacement}
              interactionLocked={surfaceLocked}
            />
            <InGameVoteStatusPanel
              open={voteStatusOpen}
              onClose={() => setVoteStatusOpen(false)}
            />
          </div>
          <InGameTribunalPresentationGate />
        </InGameActionProvider>
        </InGameChatSessionProvider>
      </InGamePlayerSessionProvider>

      {/* 죽은 사람이 받은 대기방 초대 안내: 판 조작 막힘(inert) 밖이라 읽기 도구가 읽음, 연출 창보다 아래 */}
      <InGameInviteNotice />

      <InGameEntryPreparingOverlay open={entryPreparingActive} />
      <InGameNightTurnAnnouncementOverlay
        open={nightTurn.open}
        announcement={nightTurn.announcement}
        onClose={nightTurn.close}
      />
      <InGamePhaseEntranceOverlay
        open={phaseEntrance.open}
        phase={phaseEntrance.phase}
        onConfirm={phaseEntrance.confirm}
      />
      <InGameRoleRevealOverlay
        open={roleReveal.open}
        onClose={roleReveal.close}
        roleInfo={roleReveal.roleInfo}
        players={gameState?.players}
      />
      <InGameNightPrivateResultOverlay
        open={nightPrivateResult.open}
        kind={nightPrivateResult.kind}
        label={nightPrivateResult.label}
        onConfirm={nightPrivateResult.confirm}
      />
      <InGameDawnReport
        key={dawnReport?.key ?? "none"}
        report={dawnReport}
        open={dawnReportOpen}
        onFinish={finishDawnReport}
      />
      <InGameDeadParticipantChoice
        open={deadChoiceOpen}
        selfDead={selfDead}
        onKeepWatching={handleKeepWatching}
        onLeave={requestExit}
        onRetry={retryExit}
        onResolveOutcome={resolveExitOutcome}
        exitStatus={exitStatus}
        exitErrorCode={exitErrorCode}
      />
      <InGameTribunalExpulsionOverlay
        open={tribunalExpulsion.open}
        presentationId={tribunalExpulsion.presentationId}
        message={tribunalExpulsion.message}
        onComplete={tribunalExpulsion.consume}
      />
    </div>
  )
}
