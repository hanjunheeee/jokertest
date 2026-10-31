import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerTheme } from "../constants/ingamePlayerTheme.js"
import { resolveInGameAccountProfilePhotoSrc } from "./resolveInGameAccountProfilePhotoSrc.js"
import { resolveAccountCardFrameSrc } from "./pickInGamePlayerFrame.js"

export function mergeSourcePlayerWithPreview(player, preview) {
  const status = !player.connected
    ? INGAME_PLAYER_STATUS.DISCONNECTED
    : player.alive
      ? INGAME_PLAYER_STATUS.ALIVE
      : INGAME_PLAYER_STATUS.DEAD

  const resolvedAccountPhotoSrc = Object.hasOwn(player, "accountProfilePhotoId")
    ? resolveInGameAccountProfilePhotoSrc(player.accountProfilePhotoId)
    : null
  const resolvedAccountCardFrameSrc = Object.hasOwn(player, "accountCardFrameId")
    ? resolveAccountCardFrameSrc(player.accountCardFrameId)
    : null

  return {
    ...preview,
    id: player.id,
    nickname: player.name ?? preview.nickname,
    status,
    ...(resolvedAccountPhotoSrc != null ? { portraitSrc: resolvedAccountPhotoSrc } : {}),
    ...(resolvedAccountCardFrameSrc != null ? { frameSrc: resolvedAccountCardFrameSrc } : {}),
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
    ...(Object.hasOwn(player, "accountCardFrameId")
      ? { accountCardFrameId: player.accountCardFrameId }
      : {}),
    ...(Object.hasOwn(player, "accountTotalGames")
      ? { accountTotalGames: player.accountTotalGames }
      : {}),
    ...(Object.hasOwn(player, "accountWinRate")
      ? { accountWinRate: player.accountWinRate }
      : {}),
    deathReason: player.deathReason,
  }
}
