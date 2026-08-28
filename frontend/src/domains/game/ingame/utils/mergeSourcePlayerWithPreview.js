import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerTheme } from "../constants/ingamePlayerTheme.js"

/**
 * 참가자 하나(sourcePlayers의 원소)를 preview 더미와 병합합니다. role/team/isAlly는 입력에 그
 * 키가 있을 때만 조건부로 복사합니다 — 다른 참가자에게는 role/team/isAlly 필드 자체를 서버가
 * 애초에 보내지 않으므로(비밀 유지), 여기서 무조건 복사하면 undefined 값으로라도 그
 * 키가 다시 생겨 "구조적으로 키가 없다"는 상위 계약이 깨집니다.
 *
 * themeIndex도 같은 조건부 복사 관례를 따릅니다 — 있으면 서버가 배정한 색이므로 preview의
 * 색을 덮어쓰고 theme까지 그 인덱스로 다시 계산하고, 없으면(서버 상태 없는 preview 경로)
 * preview 값을 그대로 둡니다.
 * @param {object} player - sourcePlayers 원소
 * @param {object} preview - buildInGamePreviewPlayers가 만든 같은 슬롯의 더미
 * @flow connected/alive로 status를 정한 뒤 조건부 키(role/team/isAlly/themeIndex)를 덧씌운다.
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
    ...(Object.hasOwn(player, "themeIndex")
      ? { themeIndex: player.themeIndex, theme: resolveInGamePlayerTheme(player.themeIndex) }
      : {}),
    deathReason: player.deathReason,
  }
}
