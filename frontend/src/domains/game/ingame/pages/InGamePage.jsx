import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import InGameBackground from "../components/InGameBackground.jsx"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import InGameActionPanel from "../components/actions/InGameActionPanel.jsx"
import InGameRoleRevealOverlay from "../components/roleReveal/InGameRoleRevealOverlay.jsx"
import InGamePhaseEntranceOverlay from "../components/phaseEntrance/InGamePhaseEntranceOverlay.js"
import InGameNightTurnAnnouncementOverlay from "../components/nightTurn/InGameNightTurnAnnouncementOverlay.jsx"
import InGameNightPrivateResultOverlay from "../components/nightPrivateResult/InGameNightPrivateResultOverlay.jsx"
import InGameKillRevealOverlay from "../components/killReveal/InGameKillRevealOverlay.jsx"
import InGameDeadParticipantChoice from "../components/deadChoice/InGameDeadParticipantChoice.jsx"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameTopControls from "../components/controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "../components/controls/playerRecordList/PlayerRecordListPanel.jsx"
import SettingPanel from "../components/controls/ingameSetting/SettingPanel.jsx"
import InGameVoteStatusPanel from "../components/vote/InGameVoteStatusPanel.jsx"
import InGameTimebar from "../components/timebar/InGameTimebar.jsx"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { useInGameStore } from "../store/ingameStore.js"
import { selectInGameNightTurnDeadline } from "../utils/selectInGameNightTurnDeadline.js"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "../utils/selectInGameSessionGuard.js"
import { selectInGameTimebarStatusMessage } from "../utils/selectInGameTimebarStatusMessage.js"
import { selectInGameDeadParticipantChoice } from "../utils/selectInGameDeadParticipantChoice.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameExit } from "../hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "../hooks/useInGameSessionSnapshotSync.js"
import { useInGameKillReveal } from "../hooks/useInGameKillReveal.js"
import { useInGameNightPrivateResult } from "../hooks/useInGameNightPrivateResult.js"
import { useInGameNightTurnCountdown } from "../hooks/useInGameNightTurnCountdown.js"
import { useInGameOverlayStack } from "../hooks/useInGameOverlayStack.js"
import { useInGameResultNavigation } from "../hooks/useInGameResultNavigation.js"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"

/**
 * 인게임 화면 전체(배경 + 컨트롤 + 타임바 + 플레이어 보드 + 채팅)를 조합하는 최상위 페이지
 * @flow 유효한 GameSession 상태가 없으면 아무것도 그리지 않고 /multiplay로 돌려보낸다 — 단,
 *   재접속 스냅샷 동기화가 아직 확인 중(checking)인 동안에는 판단을 미룬다.
 */
export default function InGamePage() {
  // 좌측 슬라이드 패널(전적목록·인게임 설정)은 같은 자리에 겹쳐 뜨므로 한 훅이 배타적으로
  // 관리한다 — 한쪽을 열면 다른 쪽은 저절로 닫힌다(useInGameSidePanel 참고).
  const sidePanel = useInGameSidePanel()
  const [voteStatusOpen, setVoteStatusOpen] = useState(false)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  const { requestExit, retryExit, resolveExitOutcome, exitStatus, exitErrorCode } = useInGameExit()
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  // F-23(AC-06): 확정 사망한 참가자에게만 여는 선택창. 한 번 "계속 보기"를 고르면 이 판이
  // 끝날 때까지 다시 묻지 않는다(선택 자체는 화면 상태일 뿐 서버에 아무 요청도 보내지 않는다).
  const [keepWatchingChosen, setKeepWatchingChosen] = useState(false)
  // 재접속/재연결 시 get_session_snapshot으로 현재 phase까지의 상태를 원자적으로 복원한다.
  // 이후 이벤트 단위 실시간 동기화(night_result_applied 등)는 useGameSessionSocketEvents가
  // 별도로 담당한다 — 이 훅은 그 사이에 놓친 스냅샷만 재접속 시점에 채워 넣는다.
  const snapshotSyncStatus = useInGameSessionSnapshotSync()
  // 인게임 오버레이 스택 — 역할 공개, DAY/NIGHT 진입 연출, 밤 역할 턴 안내의 표시 순서를
  // 한 곳에서 결정한다(useInGameOverlayStack 참고). 각 오버레이가 서로의 상태를 알아야 하므로
  // 이 페이지 하나에서만 호출하고 아래로 내려보낸다 — InGameActionPanel의 "내 역할 보기"
  // 버튼과 역할 공개 오버레이도 여기서 같은 열림 상태를 공유한다.
  const { roleReveal, phaseEntrance, nightTurn, interactionBlocked } = useInGameOverlayStack()

  // 사망 연출과 밤 개인 결과는 오버레이 스택 밖에서 이 페이지가 직접 조립한다 —
  // useInGameOverlayStack은 인자 없이 호출하는 기존 계약을 그대로 유지하고(로컬 오버레이 스택
  // 로직은 이 슬라이스에서 바꾸지 않는다), 두 오버레이의 우선순위는 여기서 hold로 잇는다:
  //   1. 자기 역할 공개(roleReveal) → 2. 사망 연출 → 3. 밤 개인 결과
  // 3·4번(진입 연출·역할 턴 안내)보다 위에 그려지는 것은 각자의 z 단계가 보장한다
  // (killReveal z-[70]/[71], nightPrivateResult z-[65]/[66] > 진입·안내 z-[60]/[61]).
  const killReveal = useInGameKillReveal({ hold: roleReveal.open })
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || killReveal.open,
  })

  // 게임이 실제로 끝나면(ENDED + winResult) 결과 페이지로 한 번 이동한다 — 단, 이 판정의 사망
  // 연출이 재생 중이거나 큐에 남아 있는 동안은 기다린다(연출이 통째로 잘리지 않게).
  useInGameResultNavigation({ hold: killReveal.open || killReveal.pending })

  // F-23(AC-06): 확정 사망한 참가자에게만 여는 선택창.
  //
  // 자기 사망 연출이 재생 중이거나 큐에 남아 있는 동안에는 띄우지 않는다 — 선택창이 그 위를
  // 덮으면 연출이 통째로 잘린다(기존 연출 우선순위를 그대로 따른다). 판정 근거는 잠정 피격
  // 표식이 아니라 canonical roster의 확정 alive=false다(selectInGameDeadParticipantChoice).
  const deadChoiceOpen = selectInGameDeadParticipantChoice(gameState, authUuid)
    && !keepWatchingChosen
    && !roleReveal.open
    && !killReveal.open
    && !killReveal.pending

  // 사망 연출·개인 결과가 떠 있는 동안에도 아래 게임 표면의 입력을 함께 잠근다. 잠금 판단만
  // 여기서 합치고, 오버레이 스택이 내는 interactionBlocked 자체는 그대로 아래로 흘려보낸다.
  const surfaceLocked =
    interactionBlocked || killReveal.open || nightPrivateResult.open || deadChoiceOpen

  // 상태바에 상시로 띄우는 밤 역할 턴의 남은 시간. 서버가 실어 보낸 deadline 하나에서만 만든다.
  const nightTurnDeadline = useInGameStore((s) => selectInGameNightTurnDeadline(s.state ?? null))
  const nightTurnRemainingSec = useInGameNightTurnCountdown(nightTurnDeadline)

  // 게임 중 새로고침 등으로 ingameStore가 비어있는 채 /ingame에 직접 진입하면(store가
  // 초기화되어 있음) 실제 참가자 대신 더미 프리뷰 데이터로 채워진 화면이 보인다. 유효한
  // GameSession 상태가 없으면 /multiplay로 돌려보낸다 — 새로고침한 당사자는 서버가
  // 재전송해줄 game_ended도 받을 수 없어 useGameSessionSocketEvents(전역 game_ended
  // 핸들러)만으로는 이 경로를 막지 못하므로, 이 guard로 보완한다.
  // 판단 자체는 selectInGameSessionGuard의 순수 함수 두 개가 들고 있다 — 이 페이지는 .jsx라
  // node:test로 렌더링해 검증할 수 없어, 실제 값으로 시험할 수 있는 곳으로 떼어 두었다.
  const isValidGameSession = isValidInGameSession(gameId, gameState)

  // 이 판이 바뀌면 이전 판의 "계속 보기" 선택은 더 이상 유효하지 않다 — 새 판에서 사망하면
  // 다시 물어야 한다(계정·소속 전환도 gameId 또는 self 교체로 함께 걸러진다).
  useEffect(() => { setKeepWatchingChosen(false) }, [gameId])

  useEffect(() => {
    if (!shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState })) return
    navigate("/multiplay", { replace: true })
  }, [gameId, gameState, navigate, snapshotSyncStatus])

  if (!isValidGameSession) return null

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <InGameBackground />

      {/* 진입 연출이 떠 있는 동안에는 이 게임 표면 전체를 inert로 잠근다 — 포인터도 키보드
          초점도 안으로 들어가지 못하므로 낮 투표·채팅·재판·밤 행동·결과 컨트롤이 한꺼번에
          차단된다. 오버레이들은 이 래퍼 바깥에 있어 그대로 조작할 수 있다. */}
      <div
        className={`absolute inset-0 ${surfaceLocked ? "pointer-events-none" : ""}`.trim()}
        inert={surfaceLocked || undefined}
      >
        <InGameTopControls
          onExitClick={requestExit}
          onMenuClick={sidePanel.openRecords}
          onSettingsClick={sidePanel.openSettings}
        />
        <InGamePlayerSessionProvider>
          {/* NIGHT 문구는 로컬 canonical 턴(selectInGameNightTurnRole)에서만 파생한다 — 안내
              오버레이가 닫혀도 이 줄은 턴이 끝날 때까지 남고, 남은 초는 서버 deadline에서
              만든 카운트다운 하나만 붙는다. */}
          <InGameTimebar
            day={gameState?.dayIndex}
            activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
            statusMessage={selectInGameTimebarStatusMessage(gameState, nightTurnRemainingSec)}
            onVoteStatusClick={() => setVoteStatusOpen(true)}
          />
          <InGamePlayerBoard />
          <InGameChatShell />
          <InGameActionPanel
            onOpenRoleReveal={roleReveal.reopen}
            roleRevealAvailable={Boolean(roleReveal.roleInfo)}
            interactionBlocked={interactionBlocked}
          />
          <PlayerRecordListPanel
            open={sidePanel.recordsOpen}
            onClose={sidePanel.close}
          />
          <SettingPanel open={sidePanel.settingsOpen} onClose={sidePanel.close} />
          <InGameVoteStatusPanel
            open={voteStatusOpen}
            onClose={() => setVoteStatusOpen(false)}
          />
        </InGamePlayerSessionProvider>
      </div>

      {/* 오버레이는 우선순위가 낮은 것부터 그린다 — 실제 표시 순서는 렌더 순서가 아니라
          useInGameOverlayStack이 정한 hold 관계와 각자의 z 단계가 결정한다. */}
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
      <InGameKillRevealOverlay
        open={killReveal.open}
        revealId={killReveal.revealId}
        message={killReveal.message}
        onConsume={killReveal.consume}
      />
      {/* F-23(AC-06): 확정 사망한 참가자의 두 선택. "관전 계속하기"는 서버 요청 0회이며
          소속·역할을 바꾸지 않는다 — 접은 뒤에도 상단 나가기 버튼은 그대로 쓸 수 있다. */}
      <InGameDeadParticipantChoice
        open={deadChoiceOpen}
        onKeepWatching={() => setKeepWatchingChosen(true)}
        onLeave={requestExit}
        onRetry={retryExit}
        onResolveOutcome={resolveExitOutcome}
        exitStatus={exitStatus}
        exitErrorCode={exitErrorCode}
      />
    </div>
  )
}
