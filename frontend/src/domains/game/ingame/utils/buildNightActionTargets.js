import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"

/**
 * useInGamePlayerSessionContext()가 주는 players(및 localPlayerId)를 InGameTargetPicker가
 * 기대하는 {id, name, alive, connected} 형태로 변환합니다.
 *
 * role/team 등 비밀 필드는 입력 player 객체에 있더라도(본인 항목에는 role/team이 붙어
 * 있음) 절대 복사하지 않습니다 — id/name/alive/connected 네 키만 새로 만들어 반환하므로,
 * 자기 자신이든 다른 참가자든 예외 없이 role/team이 결과에 나타나지 않습니다.
 *
 * id는 원본 player.id를 그대로 씁니다 — buildPlayerSessionSourceFromGameState가
 * player.id = player.uuid로 만들었으므로, 이 함수의 출력 id도 서버가 아는 실제 uuid와
 * 항상 같습니다(제출 시 targetId로 그대로 쓸 수 있어야 함).
 */
export function buildNightActionTargets(players, { localPlayerId, selfTargetAllowed } = {}) {
  if (!Array.isArray(players)) return []

  return players
    .filter((player) => selfTargetAllowed || player.id !== localPlayerId)
    .map((player) => ({
      id: player.id,
      name: player.nickname,
      alive: player.status !== INGAME_PLAYER_STATUS.DEAD,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
    }))
}
