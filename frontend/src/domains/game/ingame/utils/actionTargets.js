// 낮 투표·밤 행동 대상 목록 만들기 (상태를 안 건드리는 순수 계산)
// 행동 대상 훅·내 생존 고르기가 사용
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"

// 죽은 상태만 아니면 살아 있음으로 봄
export function isSessionPlayerAlive(sessionPlayer) {
  return sessionPlayer?.status !== INGAME_PLAYER_STATUS.DEAD
}

// 낮 투표 대상: 살아 있고 내가 아닌 참가자 (재투표 삭제로 제외 대상 없음)
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

// 밤 행동 대상: 동료는 못 고름, 마녀사냥꾼은 죽은 사람만 고름
// 동료 광대엔 ally 표시 (서버가 동료 지목을 거절해 카드 메뉴가 밤 항목을 숨김)
export function buildNightActionTargets(players, { localPlayerId, selfTargetAllowed, role } = {}) {
  if (!Array.isArray(players)) return []

  return players
    .filter((player) => selfTargetAllowed || player.id !== localPlayerId)
    .map((player) => ({
      id: player.id,
      name: player.isAlly ? `${player.nickname} · 동료 JOKER` : player.nickname,
      alive: player.status !== INGAME_PLAYER_STATUS.DEAD,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
      selectable: !player.isAlly && (role === "WITCH_HUNTER"
        ? player.status === INGAME_PLAYER_STATUS.DEAD
        : player.status !== INGAME_PLAYER_STATUS.DEAD),
      ...(player.isAlly ? { ally: true } : {}),
    }))
}
