import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import InGameBackground from "../components/InGameBackground.jsx"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import { InGameChatSessionProvider } from "../components/chat/InGameChatSessionProvider.jsx"
import SettingKickPlayerModalContent from "../components/controls/kickPlayer/SettingKickPlayerModalContent.jsx"
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
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  selectNightPresentationWait,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { selectInGameNightTurnDeadline } from "../utils/selectInGameNightTurnDeadline.js"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "../utils/selectInGameSessionGuard.js"
import { selectInGameTimebarStatusMessage } from "../utils/selectInGameTimebarStatusMessage.js"
import { selectInGameDeadParticipantChoice } from "../utils/selectInGameDeadParticipantChoice.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameExit } from "../hooks/useInGameExit.js"
import {
  useInGameSessionSnapshotSync,
  useInGameSnapshotRebindPending,
} from "../hooks/useInGameSessionSnapshotSync.js"
import { useInGameNightPrivateResult } from "../hooks/useInGameNightPrivateResult.js"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
import { useInGameNightTurnCountdown } from "../hooks/useInGameNightTurnCountdown.js"
import { useInGameOverlayStack } from "../hooks/useInGameOverlayStack.js"
import { useInGameTribunalExpulsionPresentation } from "../hooks/useInGameTribunalExpulsionPresentation.js"
import { useInGameResultNavigation } from "../hooks/useInGameResultNavigation.js"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"
import { useInGameActionPanel } from "../hooks/useInGameActionPanel.js"
import { useInGameKickFromCard } from "../hooks/useInGameKickFromCard.js"

export function InGameActionProvider({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })

  const hostUuid = useInGameStore((s) => s.hostUuid ?? null)
  const kick = useInGameKickFromCard()
  const [kickDialogTargetUuid, setKickDialogTargetUuid] = useState(null)
  const [isKickDialogOpen, setIsKickDialogOpen] = useState(false)
  const { requestConfirmByUuid, cancelConfirm, confirmKick, targets } = kick

  const openKickConfirm = useCallback((uuid) => {
    setKickDialogTargetUuid(uuid)
    setIsKickDialogOpen(true)
    requestConfirmByUuid(uuid)
  }, [requestConfirmByUuid])

  const closeKickDialog = useCallback(() => {
    cancelConfirm()
    setIsKickDialogOpen(false)
  }, [cancelConfirm])

  const actionContextValue = {
    ...actionPanelValue,
    hostUuid,
    isSending: kick.isSending,
    requestConfirmByUuid: openKickConfirm,
  }

  return (
    <InGameActionContext.Provider value={actionContextValue}>
      {children}
      {isKickDialogOpen ? (
        <div role="dialog" aria-label="추방" data-kick-dialog-target={kickDialogTargetUuid ?? ""}>
          <button type="button" data-testid="kick-dialog-close" onClick={closeKickDialog}>
            닫기
          </button>
          <SettingKickPlayerModalContent
            targets={targets}
            pendingTarget={kick.pendingTarget}
            status={kick.status}
            errorCode={kick.errorCode}
            isSending={kick.isSending}
            canLookupResult={kick.canLookupResult}
            isAwaitingResolution={kick.isAwaitingResolution}
            onRequestConfirm={kick.requestConfirm}
            onCancelConfirm={closeKickDialog}
            onConfirmKick={() => confirmKick(targets)}
            onLookupResult={kick.lookupResult}
          />
        </div>
      ) : null}
      {!isKickDialogOpen && (kick.canLookupResult || kick.isSending || kick.isAwaitingResolution) ? (
        <button
          type="button"
          data-testid="kick-dialog-reopen"
          onClick={() => setIsKickDialogOpen(true)}
        >
          추방 결과 조회
        </button>
      ) : null}
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
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
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
    && isSameInGameReceiptScope(
      nightPresentationWait.scope,
      readInGameReceiptScope({ accountId: authUuid, identityGeneration }),
    )
  const nightPresentationWaitOpen = nightPresentationWaitOwned
    && !nightSuccessPresentation.open

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
    || nightSuccessPresentation.open || nightPresentationWaitOpen
    || tribunalPresentationOpen || tribunalExpulsion.open

  const nightTurnDeadline = useInGameStore((s) => selectInGameNightTurnDeadline(s.state ?? null))
  const nightTurnRemainingSec = useInGameNightTurnCountdown(nightTurnDeadline)

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
              statusMessage={selectInGameTimebarStatusMessage(gameState, nightTurnRemainingSec)}
            />
            <InGameCornerActionPanel onVoteStatusClick={() => setVoteStatusOpen(true)} />
            <InGamePlayerBoard />
            <InGameChatShell />
            <PlayerRecordListPanel
              open={sidePanel.recordsOpen}
              onClose={sidePanel.close}
            />
            <SettingPanel open={sidePanel.settingsOpen} onClose={sidePanel.close} />
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
      <InGameNightPresentationWait open={nightPresentationWaitOpen} />
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
        assetStatus={nightSuccessPresentation.assetStatus}
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
