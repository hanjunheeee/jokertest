import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerThemeByColorIndex } from "../constants/ingamePlayerTheme.js"

/**
 * 참가자 하나(sourcePlayers의 원소)를 preview 더미와 병합합니다. role/team/isAlly는 입력에 그
 * 키가 있을 때만 조건부로 복사합니다 — 다른 참가자에게는 role/team/isAlly 필드 자체를 서버가
 * 애초에 보내지 않으므로(비밀 유지), 여기서 무조건 복사하면 undefined 값으로라도 그
 * 키가 다시 생겨 "구조적으로 키가 없다"는 상위 계약이 깨집니다.
 *
 * 색은 다릅니다: 서버 참가자는 preview의 색을 절대 물려받지 않고 항상 자기 colorIndex로
 * 다시 결정합니다(그래서 themeIndex/theme를 preview 전개 뒤에 무조건 덮어씁니다).
 * colorIndex가 없거나 형태가 어긋나면 theme은 null이 되고, 소비처가 테마 색 없이 기존
 * 기본색으로 그립니다 — 구세션처럼 색을 보내지 않는 서버와도 그대로 호환됩니다.
 *
 * @param {object} player sourcePlayers의 원소(id/name/connected/alive[/colorIndex/role/team/isAlly])
 * @param {object} preview 같은 슬롯의 preview 더미(초상·프레임 등 서버가 안 주는 값의 출처)
 * @flow connected/alive로 status를 고르고, colorIndex로 theme을 해석한 뒤(없으면 null),
 *   role/team/isAlly는 입력에 키가 있을 때만 복사한다.
 */
export function mergeSourcePlayerWithPreview(player, preview) {
  const status = !player.connected
    ? INGAME_PLAYER_STATUS.DISCONNECTED
    : player.alive
      ? INGAME_PLAYER_STATUS.ALIVE
      : INGAME_PLAYER_STATUS.DEAD

  const theme = resolveInGamePlayerThemeByColorIndex(player.colorIndex)

  return {
    ...preview,
    id: player.id,
    nickname: player.name ?? preview.nickname,
    status,
    themeIndex: theme ? theme.paletteIndex : null,
    theme,
    ...(Object.hasOwn(player, "role") ? { role: player.role } : {}),
    ...(Object.hasOwn(player, "team") ? { team: player.team } : {}),
    ...(Object.hasOwn(player, "isAlly") ? { isAlly: player.isAlly } : {}),
    deathReason: player.deathReason,
  }
}
