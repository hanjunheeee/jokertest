// 행동 패널 잠금·열림 계산 (상태를 안 건드리는 순수 계산)
// 행동 패널(useInGameActionPanel)이 렌더마다 부름
import { INGAME_DAY_PHASES } from "./dayPhase.js"

// 낮 투표·밤 행동·토론 준비·재판 투표 버튼의 잠금과 열림 (판정은 표가 다 차면 서버가 5초 뒤 함)
// 연결이 끊겨도 버튼은 안 잠금: 누르면 제출 훅이 안 보내고 "연결이 끊겼습니다" 글을 띄움 (눌러도 아무 일 없어 보이던 것 막기)
export function computePanelLocks({
  interactionBlocked,
  gameState,
  gameId,
  dayIndex,
  dayPhase,
  selfAliveForControls,
  isNightTurnActor,
  dayReadyStatus,
  tribunalVoteSubmit,
}) {
  const isGameEnded = gameState?.phase === "ENDED"

  // 낮 투표: 낮 투표 단계에 살아 있을 때 (판정되면 단계가 바뀌어 저절로 잠김)
  const dayVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.VOTE &&
    selfAliveForControls

  // 밤 행동: 살아 있고 지금 내 역할 차례인 밤일 때만
  const nightActionAlive = selfAliveForControls
  const nightActionsLocked =
    interactionBlocked ||
    isGameEnded ||
    !nightActionAlive ||
    !isNightTurnActor ||
    gameState?.phase !== "NIGHT"

  // 토론 준비: 낮 토론 단계에서 아직 안 냈을 때
  // 낮 세부 단계 값이 없으면(모름) 잠금 (서버는 늘 값을 줘서, 없으면 잘못 받은 상태로 봄)
  const dayReadyControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    dayPhase === INGAME_DAY_PHASES.DISCUSSION &&
    gameState?.dayPhase === INGAME_DAY_PHASES.DISCUSSION &&
    selfAliveForControls &&
    dayReadyStatus === "idle"

  // 재판: 이미 판정됐으면 투표 잠금
  const tribunalResolveLocked = interactionBlocked || gameState?.tribunal?.resolved === true

  // 재판 투표: 피고가 아니고 살아 있고 아직 안 냈을 때
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
    !tribunalResolveLocked

  return {
    dayVoteControlsEnabled,
    nightActionAlive,
    nightActionsLocked,
    dayReadyControlsEnabled,
    tribunalResolveLocked,
    tribunalVoteControlsEnabled,
  }
}
