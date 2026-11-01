// 실제 참가자를 미리보기 칸에 덧입히기와 계정 사진 경로 고르기
// 플레이어 세션 훅이 사용
import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"
import { resolveInGamePlayerTheme } from "../../../../shared/constants/ingamePlayerTheme.js"
import { resolveAccountCardFrameSrc } from "./pickInGamePlayerFrame.js"

// 실제 참가자 값으로 미리보기 칸 덮어쓰기 (계정 사진·카드 테두리가 있으면 그걸 씀)
export function mergeSourcePlayerWithPreview(player, preview) {
  // 상태: 끊김을 먼저 보고, 그다음 생존
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

// 계정 사진 경로 재료 (사각형 꼬리가 안 붙는 이름이 따로 있음)
const PHOTO_BASE = "/shopItem/player-profile/ingame/"
const ITEM_ID_PREFIX = "player-profile-"

const NAMES_WITHOUT_SQUARE_SUFFIX = new Set(["화관쓴소녀"])

// 사진 파일 이름 (_사각형이 안 붙는 이름이 따로 있음)
function photoFileName(name) {
  if (NAMES_WITHOUT_SQUARE_SUFFIX.has(name)) {
    return `프로필-${name}.png`
  }
  return `프로필-${name}_사각형.png`
}

// 계정 사진 아이템 id → 인게임 사진 경로 (모르는 id면 null)
export function resolveInGameAccountProfilePhotoSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(ITEM_ID_PREFIX)) return null
  const name = itemId.slice(ITEM_ID_PREFIX.length)
  if (!name) return null
  return `${PHOTO_BASE}${photoFileName(name)}`.normalize("NFD")
}
