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

// 죽은 참가자 관전·나가기 복구 선택 창 상태 묶음
function useDeadChoiceModalState({ gameState, authUuid, identityGeneration, gameId, exit, blocked }) {
  const scopeVer = useSyncExternalStore(subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion)
  const choiceScopeKey = `${authUuid}|${identityGeneration}|${gameId}|${scopeVer}`
  const [keepWatchingScope, setKeepWatchingScope] = useState(null)
  const keepWatchingChosen = keepWatchingScope !== null && keepWatchingScope === choiceScopeKey
  const needsDeadChoice = selectInGameDeadParticipantChoice(gameState, authUuid) && !keepWatchingChosen
  // 산 사람이 나가기에 실패해도 이 창이 열려서 사망 글은 죽은 사람에게만
  const selfDead = selectInGameSelfAlive(gameState) === false
  const exitRecoveryKey = `${choiceScopeKey}|${exit.exitAttemptId}`
  const [acknowledgedExitRecovery, setAcknowledgedExitRecovery] = useState(null)
  const needsExitRecovery = exit.exitStatus !== "idle" && acknowledgedExitRecovery !== exitRecoveryKey

  const handleKeepWatching = () => {
    setKeepWatchingScope(choiceScopeKey)
    setAcknowledgedExitRecovery(exitRecoveryKey)
  }

  return { selfDead, deadChoiceOpen: (needsDeadChoice || needsExitRecovery) && !blocked, handleKeepWatching }
}

// 판 안 조작 표면 (전면 연출 중에는 inert로 잠금)
function InGamePlaySurface({
  surfaceLocked,
  onExitClick,
  sidePanel,
  roleReveal,
  gameState,
  timebarStatusLabel,
  phaseTurnDeadline,
  timerPlacement,
  onTimerPlacementChange,
  remainingRatio,
  remainingSec,
  entryPreparingActive,
  coverOverlayOpen,
  voteStatusOpen,
  setVoteStatusOpen,
}) {
  return (
    <div
      className={`absolute inset-0 ${surfaceLocked ? "pointer-events-none" : ""}`.trim()}
      inert={surfaceLocked || undefined}
    >
      <InGameTopControls
        onExitClick={onExitClick}
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
      <InGameChatShell
        timerPlacement={timerPlacement}
        statusLabel={timebarStatusLabel}
        remainingRatio={remainingRatio}
        remainingSec={remainingSec}
        coverOverlayOpen={coverOverlayOpen}
      />
      <PlayerRecordListPanel
        open={sidePanel.recordsOpen}
        onClose={sidePanel.close}
        interactionLocked={surfaceLocked}
      />
      <SettingPanel
        open={sidePanel.settingsOpen}
        onClose={sidePanel.close}
        timerPlacement={timerPlacement}
        onTimerPlacementChange={onTimerPlacementChange}
        interactionLocked={surfaceLocked}
      />
      <InGameVoteStatusPanel open={voteStatusOpen} onClose={() => setVoteStatusOpen(false)} />
    </div>
  )
}

// 판 바깥에 깔리는 전면 안내·연출 창 모음
function InGameOverlayLayers({
  entryPreparingActive, nightTurn, phaseEntrance, roleReveal, players,
  nightPrivateResult, dawnReport, dawnReportOpen, onFinishDawnReport,
  deadChoiceOpen, selfDead, onKeepWatching, exit, tribunalExpulsion,
}) {
  return (
    <>
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
        players={players}
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
        onFinish={onFinishDawnReport}
      />
      <InGameDeadParticipantChoice
        open={deadChoiceOpen}
        selfDead={selfDead}
        onKeepWatching={onKeepWatching}
        onLeave={exit.requestExit}
        onRetry={exit.retryExit}
        onResolveOutcome={exit.resolveExitOutcome}
        exitStatus={exit.exitStatus}
        exitErrorCode={exit.exitErrorCode}
      />
      <InGameTribunalExpulsionOverlay
        open={tribunalExpulsion.open}
        presentationId={tribunalExpulsion.presentationId}
        message={tribunalExpulsion.message}
        onComplete={tribunalExpulsion.consume}
      />
    </>
  )
}

// 인게임 전체 화면과 단계 전환·덮개 창 상태 동기화
export default function InGamePage() {
  const sidePanel = useInGameSidePanel()
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  const exit = useInGameExit()
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const snapshotSyncStatus = useInGameSessionSnapshotSync()
  const identityRebindPending = useInGameSnapshotRebindPending()
  const tribunalExpulsion = useInGameTribunalExpulsionPresentation({ hold: false })
  const expulsionBusy = tribunalExpulsion.open || tribunalExpulsion.pending

  // 낮 시작 연출: 추방 영상이 끝난 뒤 열림 → 닫히면 낮 안내·밤 개인 결과·결과 화면으로 이어짐
  const dawnReport = useInGameStore(selectDawnReport)
  const dawnReportPending = dawnReport !== null
  const dawnReportOpen = dawnReportPending && !expulsionBusy
  const finishDawnReport = () => {
    if (dawnReport) useInGameStore.getState().finishDawnReport(dawnReport.key)
  }

  const { roleReveal, phaseEntrance, nightTurn, entryPreparingActive, interactionBlocked } =
    useInGameOverlayStack({ deathRevealActive: expulsionBusy, dawnReportActive: dawnReportPending })

  // 밤 동안은 미뤄서 낮 시작 연출 뒤에 한 번만 띄움
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || expulsionBusy || dawnReportPending || gameState?.phase === "NIGHT",
  })
  useInGameResultNavigation({ hold: identityRebindPending || expulsionBusy || dawnReportPending })

  const { selfDead, deadChoiceOpen, handleKeepWatching } = useDeadChoiceModalState({
    gameState, authUuid, identityGeneration, gameId, exit,
    blocked: roleReveal.open || dawnReportPending || nightPrivateResult.open,
  })

  const tribunalPresentationOpen =
    gameState?.phase === "TRIBUNAL" && Boolean(gameState?.tribunal?.defendantUuid) && gameState.tribunal.resolved !== true
  const surfaceLocked =
    interactionBlocked || nightPrivateResult.open || deadChoiceOpen || dawnReportOpen
    || tribunalPresentationOpen || tribunalExpulsion.open

  // 낮이 끝나 재판·밤 등으로 넘어갈 때 열어 둔 투표 현황 창 닫기
  const currentPhase = gameState?.phase ?? null
  const [prevPhase, setPrevPhase] = useState(currentPhase)
  if (prevPhase !== currentPhase) {
    setPrevPhase(currentPhase)
    if (prevPhase === "DAY" && voteStatusOpen) setVoteStatusOpen(false)
  }

  // 전면 잠금·단계 안내(죽은 사람 2초 안내 포함)·밤 차례 창이 뜨면 채팅 크게 보기 닫기
  const coverOverlayOpen = surfaceLocked || phaseEntrance.open || nightTurn.open
  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const timebarStatusLabel = selectInGameTimebarStatusLabel(gameState)
  const { remainingRatio, remainingSec } = useTurnProgress(phaseTurnDeadline)
  const { timerPlacement, setTimerPlacement } = useTimerPlacement()

  useEffect(() => {
    if (shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState })) navigate("/multiplay", { replace: true })
  }, [gameId, gameState, navigate, snapshotSyncStatus])

  if (!isValidInGameSession(gameId, gameState)) return null

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <InGameBackground />
      <InGamePlayerSessionProvider>
        <InGameChatSessionProvider>
          <InGameActionProvider interactionBlocked={interactionBlocked}>
            <InGamePlaySurface
              surfaceLocked={surfaceLocked} onExitClick={exit.requestExit} sidePanel={sidePanel}
              roleReveal={roleReveal} gameState={gameState} timebarStatusLabel={timebarStatusLabel}
              phaseTurnDeadline={phaseTurnDeadline} timerPlacement={timerPlacement}
              onTimerPlacementChange={setTimerPlacement} remainingRatio={remainingRatio}
              remainingSec={remainingSec} entryPreparingActive={entryPreparingActive}
              coverOverlayOpen={coverOverlayOpen} voteStatusOpen={voteStatusOpen} setVoteStatusOpen={setVoteStatusOpen}
            />
            <InGameTribunalPresentationGate />
          </InGameActionProvider>
        </InGameChatSessionProvider>
      </InGamePlayerSessionProvider>
      <InGameInviteNotice />
      <InGameOverlayLayers
        entryPreparingActive={entryPreparingActive} nightTurn={nightTurn} phaseEntrance={phaseEntrance}
        roleReveal={roleReveal} players={gameState?.players} nightPrivateResult={nightPrivateResult}
        dawnReport={dawnReport} dawnReportOpen={dawnReportOpen} onFinishDawnReport={finishDawnReport}
        deadChoiceOpen={deadChoiceOpen} selfDead={selfDead} onKeepWatching={handleKeepWatching}
        exit={exit} tribunalExpulsion={tribunalExpulsion}
      />
    </div>
  )
}
