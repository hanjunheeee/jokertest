import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import InGameBackground from "../components/InGameBackground.jsx"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import { InGameChatSessionProvider } from "../components/chat/InGameChatSessionProvider.jsx"
import SettingKickPlayerModalContent from "../components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalContent.jsx"
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
import InGameTimerPlacementDevToggle from "../components/dev/InGameTimerPlacementDevToggle.jsx"
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
import { selectInGameTimebarPhaseDeadline } from "../utils/selectInGameTimebarPhaseDeadline.js"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "../utils/selectInGameSessionGuard.js"
import { selectInGameTimebarStatusLabel } from "../utils/selectInGameTimebarStatusMessage.js"
import { selectInGameDeadParticipantChoice } from "../utils/selectInGameDeadParticipantChoice.js"
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
import { useInGameKickFromCard } from "../hooks/useInGameKickFromCard.js"
import { useInGameTimebarTurnProgress } from "../hooks/useInGameTimebarTurnProgress.js"
import { useInGameTimerPlacement } from "../hooks/useInGameTimerPlacement.js"

/**
 * V-1: 조작 훅(useInGameActionPanel)을 **정확히 한 번** 부르고 그 값을 아래로 흘려보내는
 * 유일한 소유자.
 *
 * 컨트롤 패널과 플레이어 카드 메뉴는 같은 선택 상태(selectedDayVoteTargetId /
 * selectedNightTargetId)와 같은 제출 경로를 봐야 한다 — 각자 훅을 부르면 인스턴스가 둘이 되어
 * 한쪽에서 고른 대상이 다른 쪽에는 없는 상태가 된다. 그래서 훅 호출부는 이 컴포넌트 하나이고,
 * 이 컴포넌트는 모듈 최상위에 둔다(렌더 안에서 정의하면 매 렌더마다 새 타입이 되어 아래
 * 트리가 통째로 다시 마운트된다). InGamePlayArea.jsx도 같은 것을 named import해 재사용한다.
 */
export function InGameActionProvider({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })

  /**
   * V-2(AC-03): 카드 메뉴의 방장 추방도 이 Provider가 소유한다.
   *
   * 왜 부모 InGamePage가 아니라 여기인가 — 카드 메뉴는 컨텍스트 값으로만 바깥과 말한다.
   * 방장 여부(hostUuid)·전송 중 여부(isSending)·확인 대화를 여는 입구(requestConfirmByUuid)가
   * 전부 이 value 안에 있어야 메뉴가 그것들을 볼 수 있다. 값과 그 값이 여는 대화가 다른
   * 컴포넌트에 나뉘어 있으면 부모가 자식의 지역 상태를 참조해야 하는 불가능한 배선이 된다.
   *
   * hostUuid는 store **최상위** 키다(useInGameSettingIsHost와 같은 출처) — 설정 → 방관리
   * 경로와 카드 경로가 서로 다른 방장 판정을 하지 않게 한다.
   */
  const hostUuid = useInGameStore((s) => s.hostUuid ?? null)
  const kick = useInGameKickFromCard()
  const [kickDialogTargetUuid, setKickDialogTargetUuid] = useState(null)
  const [isKickDialogOpen, setIsKickDialogOpen] = useState(false)
  const { requestConfirmByUuid, cancelConfirm, confirmKick, targets } = kick

  /** 카드 메뉴가 부르는 입구. 확인 단계를 열면서 그 확인을 담을 대화도 함께 연다. */
  const openKickConfirm = useCallback((uuid) => {
    setKickDialogTargetUuid(uuid)
    setIsKickDialogOpen(true)
    requestConfirmByUuid(uuid)
  }, [requestConfirmByUuid])

  /** 대화를 닫는 유일한 경로. 확인 자체도 함께 버린다(요청은 나가지 않는다). */
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
          {/* 상시 닫기. 확인 단계가 아직 안 열렸거나 결과만 남은 상태에서도 빠져나갈 길이
              있어야 한다(대화가 화면을 잠그는 상태로 남지 않게). */}
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
      {/* 대화를 닫아도 결과를 모르는 전송은 남는다. 그 상태에서 다시 열 길이 없으면 사용자는
          이미 나간 추방의 결과를 영영 확인할 수 없다 — 새 추방을 보내는 것이 아니라 **기존
          키를 조회**하는 경로다(useKickPlayerRequest의 잠금은 그대로 유지된다). */}
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
  // 이 페이지 하나에서만 호출하고 아래로 내려보낸다 — 상단 버튼 줄의 "내 역할 보기"
  // 버튼과 역할 공개 오버레이도 여기서 같은 열림 상태를 공유한다.
  const tribunalExpulsion = useInGameTribunalExpulsionPresentation({
    hold: false,
  })
  const { roleReveal, phaseEntrance, nightTurn, interactionBlocked } = useInGameOverlayStack({
    deathRevealActive: tribunalExpulsion.open || tribunalExpulsion.pending,
  })

  // 밤 개인 결과는 오버레이 스택 밖에서 이 페이지가 직접 조립한다 —
  // 오버레이들의 우선순위는 여기서 hold로 잇는다:
  //   1. 자기 역할 공개(roleReveal) → 2. TRIBUNAL GUILTY 추방 연출 → 3. 밤 성공 사건 연출 → 4. 밤 개인 결과
  // 진입 연출·역할 턴 안내는 z 단계로 그 아래에 그려진다.
  // F-27b(AC-01/AC-02/AC-03/AC-04/AC-05): 서버가 역할별로 개별 전송한 성공 사건 큐(광대 킬→
  // 의사 치료→경비원 조사→마녀사냥꾼 확인)를 하나씩 표시한다.
  const nightSuccessPresentation = useInGameNightSuccessPresentation({
    hold: roleReveal.open || tribunalExpulsion.open || tribunalExpulsion.pending,
  })
  const nightPrivateResult = useInGameNightPrivateResult({
    hold: roleReveal.open || tribunalExpulsion.open || tribunalExpulsion.pending
      || nightSuccessPresentation.open,
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
   * 표시 우선순위(CODEX 반려 수정): **자기 역할 공개보다 대기가 위다.**
   *
   * 예전에는 roleReveal.open이면 대기 화면을 접었다. 그러면 역할 공개를 열어 둔 참가자는 그
   * 밤 내내 대기 화면을 보지 못하고, 그 창을 닫는 순간에야 비로소 기다리는 쪽임을 안다 —
   * 승인 계약은 그 반대다: 비수신자는 **진행 중 내내** 대기 화면만 본다. 그래서 유효한 대기가
   * 있으면 역할 공개 오버레이는 아예 마운트하지 않고(아래 렌더 참고 — 열림 여부만 끄면 퇴장
   * 애니메이션 동안 역할·진영 문자열이 DOM에 남는다), 대기가 풀리면 그대로 다시 열린다
   * (확인한 것으로 처리하지 않는다).
   *
   * 반대로 **이미 재생 중인 개인 성공 연출**은 그대로 위에 남는다 — 잘리면 복구할 수 없고,
   * 애초에 그것을 받는 참가자는 이 밤의 비수신자가 아니다(대기 상태는 그동안에도 그대로 살아
   * 있다 — 가려졌다고 완료로 처리하지 않는다).
   */
  const nightPresentationWaitOpen = nightPresentationWaitOwned
    && !nightSuccessPresentation.open

  // 게임이 실제로 끝나면(ENDED + winResult) 결과 페이지로 한 번 이동한다.
  //
  // F-23(SPLIT-1): 신원 재결속 중에도 기다린다 — 현재 신원의 스냅샷을 확인하기 전에는 잔존
  // ENDED로 넘어가지 않는다(유한 보류, useInGameSessionSnapshotSync).
  //
  // F-27b(AC-03): 마지막 밤의 상한 해제로 ENDED가 성공 연출보다 **먼저** 도착할 수 있다. 그때
  // 그대로 넘어가면 아직 소비하지 않은 개인 연출(과 그 뒤의 최종 생존 화면)이 통째로 잘린다 —
  // 성공 연출의 pending·open도 이동을 미룬다(유한 — 큐는 반드시 비워진다).
  useInGameResultNavigation({
    hold: identityRebindPending
      || tribunalExpulsion.open || tribunalExpulsion.pending
      || nightSuccessPresentation.open || nightSuccessPresentation.pending,
  })

  // F-23(AC-06): 확정 사망한 참가자에게만 여는 선택창.
  //
  // 판정 근거는 잠정 피격 표식이 아니라 canonical roster의 확정 alive=false다
  // (selectInGameDeadParticipantChoice).
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
    // F-27b: 밤 성공 사건 연출(및 그 뒤에 이어지는 최종 생존 화면)이 떠 있는 동안에도 가려선
    // 안 된다 — 개인 결과 오버레이와 같은 이유다.
    && !nightSuccessPresentation.open
    // 개인 결과 오버레이(z-[65])보다 위에 그려지므로, 둘이 동시에 열리면 확인 버튼이 가려진다.
    && !nightPrivateResult.open
    // F-27b(AC-01): 대기 화면 위에 선택창이 뜨면 그 창의 존재 자체가 "너는 지금 기다리는
    // 쪽이다"를 넘어 다른 정보를 섞는다. 대기가 끝나면 이 창은 그대로 다시 열린다(사망 참가자의
    // 계속 보기·나가기 자격은 조금도 바뀌지 않는다).
    && !nightPresentationWaitOpen

  // 성공 사건 연출·개인 결과가 떠 있는 동안에도 아래 게임 표면의 입력을 함께 잠근다.
  // 잠금 판단만 여기서 합치고, 오버레이 스택이 내는 interactionBlocked 자체는 그대로
  // 아래로 흘려보낸다.
  const tribunalPresentationOpen =
    gameState?.phase === "TRIBUNAL"
    && Boolean(gameState?.tribunal?.defendantUuid)
    && gameState.tribunal.resolved !== true

  const surfaceLocked =
    interactionBlocked || nightPrivateResult.open || deadChoiceOpen
    || nightSuccessPresentation.open || nightPresentationWaitOpen
    || tribunalPresentationOpen || tribunalExpulsion.open

  // 확대 타이머바 — 밤 역할 턴·낮 하위 구간 마감(서버 절대 ms).
  const phaseTurnDeadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
  const timebarStatusLabel = selectInGameTimebarStatusLabel(gameState)
  const { remainingRatio, remainingSec } = useInGameTimebarTurnProgress(phaseTurnDeadline)
  const { timerPlacement, cycleTimerPlacement } = useInGameTimerPlacement()
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
      <InGameTimerPlacementDevToggle
        timerPlacement={timerPlacement}
        onCycle={cycleTimerPlacement}
      />
      <InGameBackground />

      {/* 진입 연출이 떠 있는 동안에는 이 게임 표면 전체를 inert로 잠근다 — 포인터도 키보드
          초점도 안으로 들어가지 못하므로 낮 투표·채팅·재판·밤 행동·결과 컨트롤이 한꺼번에
          차단된다. 오버레이들은 이 래퍼 바깥에 있어 그대로 조작할 수 있다. */}
      <InGamePlayerSessionProvider>
        <InGameChatSessionProvider>
        {/* V-1/V-2: 단계 행동 줄(시간바 안)과 플레이어 보드(카드 메뉴)를 같은 조작 훅
            인스턴스로 묶는다 — 둘이 한 Provider 아래에 있어야 선택 상태와 제출 경로가 하나다. */}
        <InGameActionProvider interactionBlocked={interactionBlocked}>
          <div
            className={`absolute inset-0 ${surfaceLocked ? "pointer-events-none" : ""}`.trim()}
            inert={surfaceLocked || undefined}
          >
            {/* V-2(AC-02): "내 역할 보기"는 제어 패널이 아니라 이 상단 줄이 소유한다. 열림
                상태의 출처는 그대로 useInGameOverlayStack 하나다(여기서는 그 입구만 옮겼다). */}
            <InGameTopControls
              onExitClick={requestExit}
              onMenuClick={sidePanel.openRecords}
              onSettingsClick={sidePanel.openSettings}
              onOpenRoleReveal={roleReveal.reopen}
              roleRevealAvailable={Boolean(roleReveal.roleInfo)}
            />
            {/* NIGHT 문구는 로컬 canonical 턴(selectInGameNightTurnRole)에서만 파생한다 — 안내
                오버레이가 닫혀도 이 줄은 턴이 끝날 때까지 남고, 남은 초는 서버 deadline에서
                만든 카운트다운 하나만 붙는다. */}
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
            <SettingPanel open={sidePanel.settingsOpen} onClose={sidePanel.close} />
            <InGameVoteStatusPanel
              open={voteStatusOpen}
              onClose={() => setVoteStatusOpen(false)}
            />
          </div>
          {/* TRIBUNAL 연출은 inert 잠금 밖에 둔다 — 배경 딤 위에서 유/무죄 버튼만 조작 가능. */}
          <InGameTribunalPresentationGate />
        </InGameActionProvider>
        </InGameChatSessionProvider>
      </InGamePlayerSessionProvider>

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
      {/* F-27b(AC-01, CODEX 반려 수정): 대기 중에는 역할 공개를 **마운트하지 않는다**. open만
          false로 내리면 퇴장 애니메이션(AnimatePresence) 동안 역할명·진영·동료 목록이 DOM에
          그대로 남는다 — 대기 화면이 덮고 있어도 그 문자열은 이미 이 화면의 것이다. 열림
          상태의 출처는 그대로 오버레이 스택 하나이며, 대기가 풀리면 같은 상태로 다시 열린다. */}
      {nightPresentationWaitOpen ? null : (
        <InGameRoleRevealOverlay
          open={roleReveal.open}
          onClose={roleReveal.close}
          roleInfo={roleReveal.roleInfo}
          players={gameState?.players}
        />
      )}
      {/* 대기 화면은 이 개인 결과 오버레이와 같은 z 단계를 쓴다 — 둘이 동시에 그려지면
          어느 쪽이 위인지가 렌더 순서에 좌우되므로, 대기 중에는 아예 띄우지 않는다. */}
      <InGameNightPresentationWait open={nightPresentationWaitOpen} />
      <InGameNightPrivateResultOverlay
        open={nightPrivateResult.open && !nightPresentationWaitOpen}
        kind={nightPrivateResult.kind}
        label={nightPrivateResult.label}
        onConfirm={nightPrivateResult.confirm}
      />
      {/* F-27b: 밤 성공 사건(광대 킬→의사 치료→경비원 조사→마녀사냥꾼 확인) 큐를 하나씩
          표시한다. 큐가 비면 같은 밤의 night_result_applied가 반영된 뒤에만 최종 생존
          화면으로 이어진다. */}
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
      <InGameTribunalExpulsionOverlay
        open={tribunalExpulsion.open}
        presentationId={tribunalExpulsion.presentationId}
        message={tribunalExpulsion.message}
        onComplete={tribunalExpulsion.consume}
      />
    </div>
  )
}
