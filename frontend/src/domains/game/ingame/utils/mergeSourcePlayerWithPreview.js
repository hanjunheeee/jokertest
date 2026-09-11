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
 *
 * accountProfilePhotoId/accountProfileBorderId도 같은 조건부 복사 관례를 따릅니다(F-13 AC-05).
 * 이 둘은 role과 달리 비밀이 아니라 모든 참가자에게 공개되는 계정 프로필 식별자이지만,
 * 서버가 아직 이 값을 보장하지 않는 참가자도 있을 수 있어(백엔드 gameSession.js
 * buildPlayerAccountProfileFields 참고) 있을 때만 옮기고 없으면 preview의 기본 초상을
 * 그대로 둔다 — 재접속 후에도 이 값이 남아 있으면 preview 기본 이미지로 되돌아가지 않는다.
 * @param {object} player - sourcePlayers 원소
 * @param {object} preview - buildInGamePreviewPlayers가 만든 같은 슬롯의 더미
 * @flow connected/alive로 status를 정한 뒤 조건부 키(role/team/isAlly/themeIndex/
 *       accountProfilePhotoId/accountProfileBorderId)를 덧씌운다.
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
    ...(Object.hasOwn(player, "accountProfilePhotoId")
      ? { accountProfilePhotoId: player.accountProfilePhotoId }
      : {}),
    ...(Object.hasOwn(player, "accountProfileBorderId")
      ? { accountProfileBorderId: player.accountProfileBorderId }
      : {}),
    deathReason: player.deathReason,
  }
}
