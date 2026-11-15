// 낮 투표·밤 행동 대상 목록 만들기 (상태를 안 건드리는 순수 계산)
// 행동 대상 훅·내 생존 고르기가 사용
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"
import { getRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

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

// 밤 행동 대상: 광대만 동료를 못 고름, 마녀사냥꾼은 죽은 사람만 고름
// 동료는 이름 뒤에 내 직업 이름 붙임, 막힌 동료 광대엔 ally 표시 (서버가 광대의 동료 지목만 거절해 카드 메뉴가 밤 항목을 숨김)
export function buildNightActionTargets(players, { localPlayerId, selfTargetAllowed, role } = {}) {
  if (!Array.isArray(players)) return []

  const roleName = getRoleRevealDisplay(role)?.name ?? null // 의사면 → "의사"

  return players
    .filter((player) => selfTargetAllowed || player.id !== localPlayerId)
    .map((player) => {
      const blockedAlly = player.isAlly === true && role === "JOKER" // 의사끼리는 서로 지켜 줄 수 있어 안 막음
      return {
        id: player.id,
        name: player.isAlly && roleName ? `${player.nickname} · 동료 ${roleName}` : player.nickname, // → "민수 · 동료 의사"
        alive: player.status !== INGAME_PLAYER_STATUS.DEAD,
        connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
        selectable: !blockedAlly && (role === "WITCH_HUNTER"
          ? player.status === INGAME_PLAYER_STATUS.DEAD
          : player.status !== INGAME_PLAYER_STATUS.DEAD),
        ...(blockedAlly ? { ally: true } : {}),
      }
    })
}
