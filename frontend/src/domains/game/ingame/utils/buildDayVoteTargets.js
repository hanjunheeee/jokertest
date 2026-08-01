import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"

/**
 * sessionPlayer(useInGamePlayerSessionContext가 주는 {id, nickname, status, ...}) 하나가
 * 살아있는지 판정합니다. buildNightActionTargets의 status→alive 매핑과 동일한 규칙을
 * 독립적으로 재구현합니다 — NIGHT 전용 유틸을 DAY 계약에서 재사용하지 않습니다.
 */
export function isSessionPlayerAlive(sessionPlayer) {
  return sessionPlayer?.status !== INGAME_PLAYER_STATUS.DEAD
}

/**
 * DAY 투표 대상 목록을 계산합니다. 살아있는 참가자 중 본인을 제외한 전원을 포함하며,
 * role/isAlly/team 등 진영 관련 필드는 아예 읽지 않습니다 — 살아있는 동료 JOKER도 항상
 * 선택 가능한 대상으로 남습니다(buildNightActionTargets의 selectable:false 정책과 다름).
 * connected는 InGameTargetPicker가 선택 가능 여부 판정에 쓰는 필수 필드라 함께 계산해
 * 돌려줍니다 — 연결 끊김은 UI 표시/선택 불가 사유로만 쓰이고 서버 권한의 근거가 아닙니다.
 */
export function buildDayVoteTargets(sessionPlayers, { localPlayerId } = {}) {
  if (!Array.isArray(sessionPlayers)) return []

  return sessionPlayers
    .filter((player) => isSessionPlayerAlive(player) && player.id !== localPlayerId)
    .map((player) => ({
      id: player.id,
      name: player.nickname,
      alive: true,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
    }))
}
