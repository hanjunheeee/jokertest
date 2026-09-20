import { useEffect, useState, useSyncExternalStore } from "react"
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
import InGameNightSuccessPresentation from "../components/InGameNightSuccessPresentation.jsx"
import InGameNightPresentationWait from "../components/InGameNightPresentationWait.jsx"
import InGameDeadParticipantChoice from "../components/deadChoice/InGameDeadParticipantChoice.jsx"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameTopControls from "../components/controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "../components/controls/playerRecordList/PlayerRecordListPanel.jsx"
import SettingPanel from "../components/controls/ingameSetting/SettingPanel.jsx"
import InGameVoteStatusPanel from "../components/vote/InGameVoteStatusPanel.jsx"
import InGameTimebar from "../components/timebar/InGameTimebar.jsx"
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
import { useInGameKillReveal } from "../hooks/useInGameKillReveal.js"
import { useInGameNightPrivateResult } from "../hooks/useInGameNightPrivateResult.js"
import { useInGameNightSuccessPresentation } from "../hooks/useInGameNightSuccessPresentation.js"
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
  const {
    requestExit, retryExit, resolveExitOutcome, exitStatus, exitErrorCode, exitAttemptId,
  } = useInGameExit()
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  // F-23(SPLIT-2): 계정/소속 축의 전이 세대. 같은 판에서 이탈→재입장한 **새 소속**과, 계정 값이
  // 원래대로 돌아오는 왕복(A→B→A)까지 여기서 드러난다.
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  /**
   * F-23(AC-06/SPLIT-2): 확정 사망한 참가자에게만 여는 선택창. 한 번 "계속 보기"를 고르면 같은
   * 신원·같은 판에서는 다시 묻지 않는다(선택 자체는 화면 상태일 뿐 서버에 아무 요청도 보내지
   * 않는다 — 소속·역할·가입은 그대로다).
   *
   * 선택을 boolean 하나로 들고 있으면 "누구의 선택인가"가 사라진다. 그래서 값이 아니라 **그
   * 선택이 속한 범위**를 저장한다:
   *   - 계정 uuid·인증 전이 세대 → 같은 gameId라도 다른 계정(또는 재로그인)에는 적용되지 않는다.
   *   - gameId·소속 전이 세대 → 같은 판에 다시 들어온 새 소속은 새로 묻는다(왕복도 마찬가지다).
   * 연결 축(소켓 교체·재연결)은 일부러 넣지 않는다 — 새로고침·재연결했다고 이미 한 선택을
   * 다시 묻지는 않는다.
   */
  const choiceScopeKey = `${authUuid}|${identityGeneration}|${gameId}|${identityScopeVersion}`
  const [keepWatchingScope, setKeepWatchingScope] = useState(null)
  const keepWatchingChosen = keepWatchingScope !== null && keepWatchingScope === choiceScopeKey
  // 재접속/재연결 시 get_session_snapshot으로 현재 phase까지의 상태를 원자적으로 복원한다.
  // 이후 이벤트 단위 실시간 동기화(night_result_applied 등)는 useGameSessionSocketEvents가
  // 별도로 담당한다 — 이 훅은 그 사이에 놓친 스냅샷만 재접속 시점에 채워 넣는다.
  const snapshotSyncStatus = useInGameSessionSnapshotSync()
  // F-23(SPLIT-1): 지금 이 화면이 **현재 신원의 스냅샷으로 다시 묶이는 중**인가. 신원·연결이
  // 바뀌면 사망 연출 큐는 그 즉시 버려지는데(이전 연결의 사실이므로), 그 순간 잔존 ENDED만
  // 보고 결과 화면으로 넘어가면 새 연결에서 복구될 연출이 통째로 잘린다.
  const identityRebindPending = useInGameSnapshotRebindPending()
  // 인게임 오버레이 스택 — 역할 공개, DAY/NIGHT 진입 연출, 밤 역할 턴 안내의 표시 순서를
  // 한 곳에서 결정한다(useInGameOverlayStack 참고). 각 오버레이가 서로의 상태를 알아야 하므로
  // 이 페이지 하나에서만 호출하고 아래로 내려보낸다 — InGameActionPanel의 "내 역할 보기"
  // 버튼과 역할 공개 오버레이도 여기서 같은 열림 상태를 공유한다.
  const { roleReveal, phaseEntrance, nightTurn, interactionBlocked } = useInGameOverlayStack()

  // 사망 연출과 밤 개인 결과는 오버레이 스택 밖에서 이 페이지가 직접 조립한다 —
  // useInGameOverlayStack은 인자 없이 호출하는 기존 계약을 그대로 유지하고(로컬 오버레이 스택
  // 로직은 이 슬라이스에서 바꾸지 않는다), 오버레이들의 우선순위는 여기서 hold로 잇는다:
  //   1. 자기 역할 공개(roleReveal) → 2. 사망 연출 → 3. 밤 성공 사건 연출 → 4. 밤 개인 결과
  // 5·6번(진입 연출·역할 턴 안내)보다 위에 그려지는 것은 각자의 z 단계가 보장한다
  // (killReveal z-[70]/[71], nightSuccessPresentation도 KILL은 같은 z-[70]/[71](kill reveal이
  // hold로 동시에 열리지 않는다), 나머지 세 종류·nightPrivateResult는 z-[65]/[66] > 진입·안내
  // z-[60]/[61]).
  const killReveal = useInGameKillReveal({ hold: roleReveal.open })
  // F-27b(AC-01/AC-02/AC-03/AC-04/AC-05): 서버가 역할별로 개별 전송한 성공 사건 큐(광대 킬→
  // 의사 치료→경비원 조사→마녀사냥꾼 확인)를 하나씩 표시한다.
  const nightSuccessPresentation = useInGameNightSuccessPresentation({
    hold: roleReveal.open || killReveal.open,
  })
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || killReveal.open || nightSuccessPresentation.open,
  })

  /**
   * F-27b(AC-01): 이 밤의 연출을 **하나도 받지 않는** 참가자의 대기.
   *
   * store가 들고 있는 값은 "서버가 그렇게 알렸다"는 사실과 그것을 받은 수신 범위뿐이다(역할·
   * 대상·사건 ID는 어디에도 없다). 그 범위가 지금과 여덟 축 모두 같을 때만 화면을 연다 —
   * 이전 계정·이전 소속·이전 연결이 받은 대기는 이 화면의 사실이 아니다(공개 사망 연출과 같은
   * fail-closed 경계다). 밤 이탈·다른 밤으로의 전이는 store가 커밋마다 정리한다.
   */
  const nightPresentationWait = useInGameStore(selectNightPresentationWait)
  const nightPresentationWaitOwned = nightPresentationWait !== null
    && nightPresentationWait.gameId === gameId
    && gameState?.phase === "NIGHT"
    && gameState?.dayIndex === nightPresentationWait.nightDayIndex
    && isSameInGameReceiptScope(
      nightPresentationWait.scope,
      readInGameReceiptScope({ accountId: authUuid, identityGeneration }),
    )
  /**
   * 표시 우선순위: 이미 재생 중인 연출(자기 역할 공개·공개 사망·성공 사건)이 있으면 그쪽이
   * 먼저다. 대기 화면은 그 아래에서 기다리다가 다시 떠오르며, 그동안에도 대기 상태 자체는
   * 그대로다 — 가려졌다고 완료로 처리하지 않는다(해제 권한은 서버에만 있다).
   */
  const nightPresentationWaitOpen = nightPresentationWaitOwned
    && !roleReveal.open && !killReveal.open && !nightSuccessPresentation.open

  // 게임이 실제로 끝나면(ENDED + winResult) 결과 페이지로 한 번 이동한다 — 단, 이 판정의 사망
  // 연출이 재생 중이거나 큐에 남아 있는 동안은 기다린다(연출이 통째로 잘리지 않게).
  //
  // F-23(SPLIT-1): 신원 재결속 중에도 기다린다. 그 구간의 killReveal은 "보여줄 연출이 없다"가
  // 아니라 "이 신원이 받은 것인지 아직 모른다"이므로, 큐가 비었다는 사실만으로 넘어가면 옛
  // 신원의 잔존 ENDED로 결과 화면에 들어간다. 이 보류는 유한하다 — 스냅샷 요청이 성공·실패·
  // 거부 어느 쪽으로 끝나도 해제된다(useInGameSessionSnapshotSync).
  //
  // F-27b(AC-03): 마지막 밤의 상한 해제로 ENDED가 성공 연출보다 **먼저** 도착할 수 있다. 그때
  // 그대로 넘어가면 아직 소비하지 않은 개인 연출(과 그 뒤의 최종 생존 화면)이 통째로 잘린다 —
  // 사망 연출과 같은 이유로 성공 연출의 pending·open도 이동을 미룬다. 이 보류 역시 유한하다:
  // 큐는 정상 종료·오류·건너뛰기 어느 경로로도 반드시 비워지고, 최종 화면은 확인으로 닫힌다.
  useInGameResultNavigation({
    hold: killReveal.open || killReveal.pending || identityRebindPending
      || nightSuccessPresentation.open || nightSuccessPresentation.pending,
  })

  // F-23(AC-06): 확정 사망한 참가자에게만 여는 선택창.
  //
  // 자기 사망 연출이 재생 중이거나 큐에 남아 있는 동안에는 띄우지 않는다 — 선택창이 그 위를
  // 덮으면 연출이 통째로 잘린다(기존 연출 우선순위를 그대로 따른다). 판정 근거는 잠정 피격
  // 표식이 아니라 canonical roster의 확정 alive=false다(selectInGameDeadParticipantChoice).
  const needsDeadChoice = selectInGameDeadParticipantChoice(gameState, authUuid) && !keepWatchingChosen

  /**
   * F-23(SPLIT-2): **선택이 필요한가**와 **복구가 필요한가**는 다른 질문이다.
   *
   * 예전에는 둘이 한 값에 묶여 있어서, 계속 보기를 고른 뒤 상단 "게임 나가기"를 눌렀다가
   * 실패하거나 ACK가 유실되면 그 사실을 알릴 자리 자체가 사라졌다 — 화면은 그대로인데 왜
   * 그런지 알 수 없고, 다시 시도할 수단도 없었다. 나가기 요청이 idle이 아닌 동안에는 계속
   * 보기 선택과 무관하게 같은 창이 상태 안내와 복구 버튼을 띄운다(그 창이 이미 inert 본문
   * 바깥에 있으므로 실제로 조작할 수 있다).
   *
   * 다만 그 안내에도 **닫는 길**이 있어야 한다. 실패·미확정은 사용자가 재시도를 미루고 계속
   * 관전할 수 있는 상태인데, 예전에는 "관전 계속하기"가 선택 범위만 저장해 needsExitRecovery가
   * 계속 참이었고 — 버튼은 눌리는데 창도 본문 inert도 풀리지 않아 화면이 잠겼다. 이제 그
   * 버튼은 **지금 시도의 안내를 확인했다**는 사실까지 함께 기록한다. 재시도 경로는 그대로다:
   * 상단 나가기가 새 시도를 열면 exitAttemptId가 달라져 안내와 복구 버튼이 다시 뜬다.
   */
  const exitRecoveryKey = `${choiceScopeKey}|${exitAttemptId}`
  const [acknowledgedExitRecovery, setAcknowledgedExitRecovery] = useState(null)
  const needsExitRecovery = exitStatus !== "idle" && acknowledgedExitRecovery !== exitRecoveryKey

  /** 계속 보기 = 이 신원·이 판에서 다시 묻지 않는다 + 지금 시도의 나가기 안내를 접는다. */
  const handleKeepWatching = () => {
    setKeepWatchingScope(choiceScopeKey)
    setAcknowledgedExitRecovery(exitRecoveryKey)
  }

  const deadChoiceOpen = (needsDeadChoice || needsExitRecovery)
    && !roleReveal.open
    && !killReveal.open
    && !killReveal.pending
    // F-27b: 밤 성공 사건 연출(및 그 뒤에 이어지는 최종 생존 화면)이 떠 있는 동안에도 가려선
    // 안 된다 — 개인 결과 오버레이와 같은 이유다.
    && !nightSuccessPresentation.open
    // 개인 결과 오버레이(z-[65])보다 위에 그려지므로, 둘이 동시에 열리면 확인 버튼이 가려진다.
    && !nightPrivateResult.open
    // F-27b(AC-01): 대기 화면 위에 선택창이 뜨면 그 창의 존재 자체가 "너는 지금 기다리는
    // 쪽이다"를 넘어 다른 정보를 섞는다. 대기가 끝나면 이 창은 그대로 다시 열린다(사망 참가자의
    // 계속 보기·나가기 자격은 조금도 바뀌지 않는다).
    && !nightPresentationWaitOpen

  // 사망 연출·성공 사건 연출·개인 결과가 떠 있는 동안에도 아래 게임 표면의 입력을 함께
  // 잠근다. 잠금 판단만 여기서 합치고, 오버레이 스택이 내는 interactionBlocked 자체는 그대로
  // 아래로 흘려보낸다.
  const surfaceLocked =
    interactionBlocked || killReveal.open || nightPrivateResult.open || deadChoiceOpen
    || nightSuccessPresentation.open || nightPresentationWaitOpen

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
      {/* F-27b(AC-01): 대기 중에는 턴 안내·진입 연출·개인 결과를 그 위에 띄우지 않는다.
          띄우지 않을 뿐 각자의 상태는 그대로다 — 대기가 끝나면 원래 순서대로 다시 열린다
          (가려진 오버레이를 확인한 것으로 처리하지 않는다). */}
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
      <InGameRoleRevealOverlay
        open={roleReveal.open}
        onClose={roleReveal.close}
        roleInfo={roleReveal.roleInfo}
        players={gameState?.players}
      />
      {/* 대기 화면은 이 개인 결과 오버레이와 같은 z 단계를 쓴다 — 둘이 동시에 그려지면
          어느 쪽이 위인지가 렌더 순서에 좌우되므로, 대기 중에는 아예 띄우지 않는다. */}
      <InGameNightPresentationWait open={nightPresentationWaitOpen} />
      <InGameNightPrivateResultOverlay
        open={nightPrivateResult.open && !nightPresentationWaitOpen}
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
      {/* F-27b: 밤 성공 사건(광대 킬→의사 치료→경비원 조사→마녀사냥꾼 확인) 큐를 하나씩
          표시한다. KILL은 기존 사망 연출 영상을, 나머지는 임시 연출을 보여주고, 큐가 비면
          같은 밤의 night_result_applied가 반영된 뒤에만 최종 생존 화면으로 이어진다. */}
      <InGameNightSuccessPresentation
        current={nightSuccessPresentation.current}
        open={nightSuccessPresentation.open}
        finish={nightSuccessPresentation.finish}
        assetStatus={nightSuccessPresentation.assetStatus}
        finalStatus={nightSuccessPresentation.finalStatus}
        onClose={nightSuccessPresentation.onClose}
      />
      {/* F-23(AC-06): 확정 사망한 참가자의 두 선택. "관전 계속하기"는 서버 요청 0회이며
          소속·역할을 바꾸지 않는다 — 접은 뒤에도 상단 나가기 버튼은 그대로 쓸 수 있다. */}
      <InGameDeadParticipantChoice
        open={deadChoiceOpen}
        onKeepWatching={handleKeepWatching}
        onLeave={requestExit}
        onRetry={retryExit}
        onResolveOutcome={resolveExitOutcome}
        exitStatus={exitStatus}
        exitErrorCode={exitErrorCode}
      />
    </div>
  )
}
