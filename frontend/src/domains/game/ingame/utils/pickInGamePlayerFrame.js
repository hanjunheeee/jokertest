import {
  INGAME_PLAYER_ALIVE_FRAME_VARIANTS,
  INGAME_PLAYER_DEAD_FRAME_VARIANTS,
} from "../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../constants/board/status/ingamePlayerStatus.js"
// F-14(AC-01/AC-04): "@/" alias는 Vite 빌드 전용 해석이라 node:test에서 이 파일을 실제로
// (mock.module로 대체하지 않고) import하면 풀리지 않는다(이 파일의 새 resolveAccountCardFrameSrc를
// 실값으로 검증하는 publicAssetReferences.test.js·mergeSourcePlayerWithPreview.test.js가
// 이 경로를 실제로 탄다) — 상대 경로로 바꿔 node:test에서도 그대로 동작하게 한다(같은
// 모듈, 동일한 동작).
import { pickJobPortrait } from "../../../../shared/utils/pickJobPortrait.js"

/** 슬롯 index 기준 더미 alive 프레임 PNG 순환 */
export function pickInGamePlayerFrame(index) {
  return pickJobPortrait(index, INGAME_PLAYER_ALIVE_FRAME_VARIANTS)
}

// F-14(AC-01/AC-04): frontend/public/shopItem/player-card/playerframe-alive의 실제 alive
// 프레임 경로 규칙. shared/utils/resolveAccountProfileAssets.js와 같은 이유로(game 도메인은
// user 도메인 상수를 import하지 않는다) 문자열 규칙을 독립적으로 복제한다.
const PLAYER_CARD_ALIVE_DIR = "/shopItem/player-card/playerframe-alive"
const PLAYER_CARD_ITEM_ID_PREFIX = "player-card-"

/**
 * 서버가 확정한 공개 카드 프레임 itemId(accountCardFrameId)를 실제 alive 프레임 자산
 * 경로로 바꾼다(F-14 AC-01: 구매한 플레이어 카드를 실제 보드에 적용, AC-04: 프로필 사진·
 * 테두리와 독립적으로 적용된다). 규칙을 따르지 않는(알 수 없는) 값이면 null을 돌려준다 —
 * 호출부가 기존 더미 순환 프레임을 그대로 쓴다.
 *
 * 이 디렉터리의 실제 파일은 NFC로 저장돼 있다(INGAME_PLAYER_ALIVE_FRAME_VARIANTS 주석 —
 * "NFD로 맞추면 프레임이 전부 404가 된다") — user 도메인의 다른 자산 해석기(resolveAccountProfileAssets.js
 * 등)가 NFD를 쓰는 것과 다르므로 이 디렉터리에서는 NFC를 그대로 따른다.
 * @param {string | null | undefined} itemId
 * @returns {string | null}
 */
export function resolveAccountCardFrameSrc(itemId) {
  if (typeof itemId !== "string" || !itemId.startsWith(PLAYER_CARD_ITEM_ID_PREFIX)) return null
  const variant = itemId.slice(PLAYER_CARD_ITEM_ID_PREFIX.length)
  if (!variant) return null
  return `${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(${variant}).png`.normalize("NFC")
}

/**
 * alive 프레임 + status → 표시용 프레임 경로
 * @param {string} aliveFrameSrc
 * @param {import("../constants/board/status/ingamePlayerStatus.js").InGamePlayerStatus} status
 */
export function resolveInGamePlayerFrameSrc(aliveFrameSrc, status) {
  if (status !== INGAME_PLAYER_STATUS.DEAD) {
    return aliveFrameSrc
  }

  const variantIndex = INGAME_PLAYER_ALIVE_FRAME_VARIANTS.indexOf(aliveFrameSrc)

  if (variantIndex < 0) {
    return INGAME_PLAYER_DEAD_FRAME_VARIANTS[0]
  }

  return INGAME_PLAYER_DEAD_FRAME_VARIANTS[
    variantIndex % INGAME_PLAYER_DEAD_FRAME_VARIANTS.length
  ]
}
