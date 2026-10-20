import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
import { resolveInGamePlayerTheme } from "../constants/ingamePlayerTheme.js"
import { resolveInGameAccountProfilePhotoSrc } from "./resolveInGameAccountProfilePhotoSrc.js"
import { resolveAccountCardFrameSrc } from "./pickInGamePlayerFrame.js"

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
 * buildPlayerAccountProfileFields 참고) 있을 때만 옮긴다.
 *
 * portraitSrc만 accountProfilePhotoId로 덮어쓴다 — pickInGameJobPortrait가 만드는
 * preview.portraitSrc는 슬롯 index로 순환하는 더미 클로즈업 PNG일 뿐이라, 유효한 계정
 * 사진이 있으면 그 더미 대신 실제 계정 사진을 최종 초상으로 쓴다(재접속해도 이 값이
 * 유지되므로 preview 기본 이미지로 되돌아가지 않는다). frameSrc는 건드리지 않는다 —
 * 인게임 카드의 frameSrc는 계정 프로필 테두리가 아니라 장착한 직업 스킨/카드 프레임
 * 소유이므로, accountProfileBorderId로 덮어쓰면 스킨 표시가 깨진다.
 *
 * accountProfileBorderId는 인게임 카드에서 원형 프로필 프레임을 그리지 않으므로
 * portraitSrc 해석에는 쓰지 않는다 — id 자체는 조건부 복사만 유지한다.
 * @param {object} player - sourcePlayers 원소
 * @param {object} preview - buildInGamePreviewPlayers가 만든 같은 슬롯의 더미
 * @flow connected/alive로 status를 정한 뒤 조건부 키(role/team/isAlly/themeIndex/
 *       accountProfilePhotoId/accountProfileBorderId)를 덧씌우고, 유효한 계정 사진이
 *       있으면 portraitSrc를 ingame 사각형 자산으로 바꾼다.
 */
export function mergeSourcePlayerWithPreview(player, preview) {
  const status = !player.connected
    ? INGAME_PLAYER_STATUS.DISCONNECTED
    : player.alive
      ? INGAME_PLAYER_STATUS.ALIVE
      : INGAME_PLAYER_STATUS.DEAD

  const resolvedAccountPhotoSrc = Object.hasOwn(player, "accountProfilePhotoId")
    ? resolveInGameAccountProfilePhotoSrc(player.accountProfilePhotoId)
    : null
  // F-14(AC-01/AC-04): 장착한 플레이어 카드 프레임(accountCardFrameId)은 profile photo·
  // border와 마찬가지로 공개 필드다(어떤 역할이든 같은 카드를 고를 수 있어 역할을 드러내지
  // 않는다) — 있으면 preview의 더미 순환 frameSrc를 실제 장착 프레임으로 덮어쓴다.
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
    // CO S-1(AC-05): 전적 목록이 읽는 값이다. 이 병합이 마지막 관문이라 여기서 빠뜨리면
    // builder가 옮겨 온 전적이 화면 직전에 사라진다 — 0판 0%도 서버가 말한 사실이므로
    // 그대로 옮기고(0을 누락으로 취급하지 않는다), 키가 없는 참가자에게는 만들지 않는다.
    ...(Object.hasOwn(player, "accountTotalGames")
      ? { accountTotalGames: player.accountTotalGames }
      : {}),
    ...(Object.hasOwn(player, "accountWinRate")
      ? { accountWinRate: player.accountWinRate }
      : {}),
    deathReason: player.deathReason,
  }
}
