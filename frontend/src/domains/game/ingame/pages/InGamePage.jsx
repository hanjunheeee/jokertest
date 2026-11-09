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
import InGameNightSuccessPresentation from "../components/InGameNightSuccessPresentation.jsx"
import InGameNightPresentationWait from "../components/InGameNightPresentationWait.jsx"
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
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import {
  getIdentityScopeVersion,
  isSameReceiptScope,
  readInGameReceiptScope,
  selectNightPresentationWait,
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
import { nightWaitCoversSelf } from "../utils/selfAlive.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameExit } from "../hooks/useInGameExit.js"
import {
  useInGameSessionSnapshotSync,
  useInGameSnapshotRebindPending,
} from "../hooks/useInGameSessionSnapshotSync.js"
import { useInGameNightPrivateResult } from "../hooks/useInGameNightPrivateResult.js"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { useInGameOverlayStack } from "../hooks/useInGameOverlayStack.js"
import { useInGameTribunalExpulsionPresentation } from "../hooks/useInGameTribunalExpulsionPresentation.js"
import { useInGameResultNavigation } from "../hooks/useInGameResultNavigation.js"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"
import { useInGameActionPanel } from "../hooks/useInGameActionPanel.js"
import { useTurnProgress } from "../hooks/timebar/useTurnProgress.js"
import { useTimerPlacement } from "../hooks/timebar/useTimerPlacement.js"

// 판 조작 값(행동 줄·카드 메뉴·재판 연출이 같이 봄)을 컨텍스트로 넣음
// 카드에서 여는 추방 창은 열 길이 없어 걷어 냄 (추방은 설정 창 방관리 탭의 추방 창만)
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
  const { roleReveal, phaseEntrance, nightTurn, interactionBlocked } = useInGameOverlayStack({
    deathRevealActive: tribunalExpulsion.open || tribunalExpulsion.pending,
  })

  const nightSuccessPresentation = useInGameNightSuccessPresentation({
    hold: roleReveal.open || tribunalExpulsion.open || tribunalExpulsion.pending,
  })
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || tribunalExpulsion.open || tribunalExpulsion.pending
      || nightSuccessPresentation.open,
  })

  const nightPresentationWait = useInGameStore(selectNightPresentationWait)
  const nightPresentationWaitOwned = nightPresentationWait !== null
    && nightPresentationWait.gameId === gameId
    && gameState?.phase === "NIGHT"
    && gameState?.dayIndex === nightPresentationWait.nightDayIndex
    && isSameReceiptScope(
      nightPresentationWait.scope,
      readInGameReceiptScope({ accountId: authUuid, identityGeneration }),
    )
  const nightPresentationWaitOpen = nightPresentationWaitOwned
    && !nightSuccessPresentation.open
  // 죽은 사람은 대기 창이 안 덮음 → 밤에도 죽은 사람 채팅 씀 (다른 연출 미루기는 대기 그대로)
  const nightPresentationWaitCovers = nightPresentationWaitOpen && nightWaitCoversSelf(gameState)

  useInGameResultNavigation({
    hold: identityRebindPending
      || tribunalExpulsion.open || tribunalExpulsion.pending
      || nightSuccessPresentation.open || nightSuccessPresentation.pending,
  })

  const needsDeadChoice = selectInGameDeadParticipantChoice(gameState, authUuid) && !keepWatchingChosen

  const exitRecoveryKey = `${choiceScopeKey}|${exitAttemptId}`
  const [acknowledgedExitRecovery, setAcknowledgedExitRecovery] = useState(null)
  const needsExitRecovery = exitStatus !== "idle" && acknowledgedExitRecovery !== exitRecoveryKey

  const handleKeepWatching = () => {
    setKeepWatchingScope(choiceScopeKey)
    setAcknowledgedExitRecovery(exitRecoveryKey)
  }

  const deadChoiceOpen = (needsDeadChoice || needsExitRecovery)
    && !roleReveal.open
    && !nightSuccessPresentation.open
    && !nightPrivateResult.open
    && !nightPresentationWaitOpen

  const tribunalPresentationOpen =
    gameState?.phase === "TRIBUNAL"
    && Boolean(gameState?.tribunal?.defendantUuid)
    && gameState.tribunal.resolved !== true

  const surfaceLocked =
    interactionBlocked || nightPrivateResult.open || deadChoiceOpen
    || nightSuccessPresentation.open || nightPresentationWaitCovers
    || tribunalPresentationOpen || tribunalExpulsion.open

  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const timebarStatusLabel = selectInGameTimebarStatusLabel(gameState)
  const { remainingRatio, remainingSec } = useTurnProgress(phaseTurnDeadline)
  const { timerPlacement, cycleTimerPlacement } = useTimerPlacement()

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
            />
            <InGameCornerActionPanel onVoteStatusClick={() => setVoteStatusOpen(true)} />
            <InGamePlayerBoard />
            <InGameChatShell
              timerPlacement={timerPlacement}
              statusLabel={timebarStatusLabel}
              remainingRatio={remainingRatio}
              remainingSec={remainingSec}
            />
            <PlayerRecordListPanel
              open={sidePanel.recordsOpen}
              onClose={sidePanel.close}
            />
            <SettingPanel
              open={sidePanel.settingsOpen}
              onClose={sidePanel.close}
              timerPlacement={timerPlacement}
              onCycleTimerPlacement={cycleTimerPlacement}
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

      <InGameNightTurnAnnouncementOverlay
        open={nightTurn.open && !nightPresentationWaitOpen}
        announcement={nightTurn.announcement}
        onClose={nightTurn.close}
      />
      <InGamePhaseEntranceOverlay
        open={phaseEntrance.open && !nightPresentationWaitOpen}
        phase={phaseEntrance.phase}
        onConfirm={phaseEntrance.confirm}
      />
      {nightPresentationWaitOpen ? null : (
        <InGameRoleRevealOverlay
          open={roleReveal.open}
          onClose={roleReveal.close}
          roleInfo={roleReveal.roleInfo}
          players={gameState?.players}
        />
      )}
      <InGameNightPresentationWait open={nightPresentationWaitCovers} />
      <InGameNightPrivateResultOverlay
        open={nightPrivateResult.open && !nightPresentationWaitOpen}
        kind={nightPrivateResult.kind}
        label={nightPrivateResult.label}
        onConfirm={nightPrivateResult.confirm}
      />
      <InGameNightSuccessPresentation
        current={nightSuccessPresentation.current}
        open={nightSuccessPresentation.open}
        finish={nightSuccessPresentation.finish}
        finalStatus={nightSuccessPresentation.finalStatus}
        onClose={nightSuccessPresentation.onClose}
      />
      <InGameDeadParticipantChoice
        open={deadChoiceOpen}
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
