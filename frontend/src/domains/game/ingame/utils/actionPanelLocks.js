// 행동 패널 잠금·열림 계산 (상태를 안 건드리는 순수 계산)
// 행동 패널(useInGameActionPanel)이 렌더마다 부름
import { INGAME_DAY_PHASES } from "./resolveInGameDayPhase.js"

// 낮 투표·밤 행동·토론 준비·재판 투표·재판 판정 버튼의 잠금과 열림
// connected: 지금 공용 소켓이 붙어 있는지 (재판 버튼만 봄)
export function computePanelLocks({
  interactionBlocked,
  gameState,
  gameId,
  dayIndex,
  dayPhase,
  selfAliveForControls,
  isNightTurnActor,
  resolveNightStatus,
  dayVoteResolveStatus,
  dayReadyStatus,
  tribunalVoteSubmit,
  tribunalResolveStatus,
  connected,
}) {
  const isGameEnded = gameState?.phase === "ENDED"

  // 낮 투표: 판정 중이거나 판정이 끝나면 잠금
  const dayVoteResolveLocked = dayVoteResolveStatus !== "idle" || interactionBlocked
  const dayVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.VOTE &&
    selfAliveForControls &&
    !dayVoteResolveLocked

  // 밤 행동: 살아 있고 지금 내 역할 차례이며 밤 판정 전일 때만
  const nightActionAlive = selfAliveForControls
  const nightActionsLocked =
    interactionBlocked ||
    isGameEnded ||
    !nightActionAlive ||
    !isNightTurnActor ||
    resolveNightStatus !== "idle" ||
    gameState?.phase !== "NIGHT"

  // 토론 준비: 낮 토론 단계에서 아직 안 냈을 때
  const dayReadyControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.DISCUSSION &&
    selfAliveForControls &&
    dayReadyStatus === "idle"

  // 재판: 판정 요청 중이거나 이미 판정됐으면 투표·판정 둘 다 잠금
  const tribunalResolveLocked =
    interactionBlocked || tribunalResolveStatus !== "idle" || gameState?.tribunal?.resolved === true

  const tribunalVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalVoteSubmit.isDefendant &&
    tribunalVoteSubmit.alive &&
    tribunalVoteSubmit.status === "idle" &&
    !tribunalResolveLocked &&
    connected

  const tribunalResolveControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalResolveLocked &&
    connected

  return {
    dayVoteResolveLocked,
    dayVoteControlsEnabled,
    nightActionAlive,
    nightActionsLocked,
    dayReadyControlsEnabled,
    tribunalResolveLocked,
    tribunalVoteControlsEnabled,
    tribunalResolveControlsEnabled,
  }
}
