import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"

/**
 * 참가자 하나(sourcePlayers의 원소)를 preview 더미와 병합합니다. role/team/isAlly는 입력에 그
 * 키가 있을 때만 조건부로 복사합니다 — 다른 참가자에게는 role/team/isAlly 필드 자체를 서버가
 * 애초에 보내지 않으므로(비밀 유지), 여기서 무조건 복사하면 undefined 값으로라도 그
 * 키가 다시 생겨 "구조적으로 키가 없다"는 상위 계약이 깨집니다.
 */
export function mergeSourcePlayerWithPreview(player, preview) {
  const status = !player.connected
    ? INGAME_PLAYER_STATUS.DISCONNECTED
    : player.alive
      ? INGAME_PLAYER_STATUS.ALIVE
      : INGAME_PLAYER_STATUS.DEAD

  return {
    ...preview,
    id: player.id,
    nickname: player.name ?? preview.nickname,
    status,
    ...(Object.hasOwn(player, "role") ? { role: player.role } : {}),
    ...(Object.hasOwn(player, "team") ? { team: player.team } : {}),
    ...(Object.hasOwn(player, "isAlly") ? { isAlly: player.isAlly } : {}),
    deathReason: player.deathReason,
  }
}
