/**
 * 인게임 플레이어 Status UI — enum·preview·에셋·레이아웃
 */

export const INGAME_PLAYER_STATUS = {
  ALIVE: "alive",
  DEAD: "dead",
  DISCONNECTED: "disconnected",
}

/** @typedef {typeof INGAME_PLAYER_STATUS[keyof typeof INGAME_PLAYER_STATUS]} InGamePlayerStatus */

/** dev preview — slotIndex별 고정 status */
export const INGAME_PREVIEW_PLAYER_STATUS_BY_SLOT = {
  0: INGAME_PLAYER_STATUS.DEAD,
  1: INGAME_PLAYER_STATUS.DISCONNECTED,
}

/** @param {number} slotIndex @returns {InGamePlayerStatus} */
export function getPreviewPlayerStatus(slotIndex) {
  return (
    INGAME_PREVIEW_PLAYER_STATUS_BY_SLOT[slotIndex] ??
    INGAME_PLAYER_STATUS.ALIVE
  )
}

/** @param {InGamePlayerStatus} status */
export function isInGamePlayerStatusActive(status) {
  return status === INGAME_PLAYER_STATUS.ALIVE
}

/** public/frame/ingame-status */
export const INGAME_PLAYER_STATUS_ASSETS = {
  dead: "/frame/ingame-status/게임사망상태.png",
  disconnected: "/frame/ingame-status/연결끊김상태.png",
}

/** 인게임-플레이어프레임(베이스) — 초상창과 동일 클리핑 (playerPortraitLayout ingameCard) */
export const INGAME_PLAYER_STATUS_OVERLAY_INSET = {
  top: "9%",
  bottom: "21%",
  left: "10%",
  right: "10%",
}

/** 연결끊김 배지 — 초상창 중앙 (% 크기, flex 래퍼 기준) */
export const INGAME_PLAYER_STATUS_BADGE_CLASS =
  "pointer-events-none block h-[86%] w-[86%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.35]"

/** 사망(해골) 배지 — PNG 여백 보정 scale, 연결끊김보다 큼 */
export const INGAME_PLAYER_STATUS_DEAD_BADGE_CLASS =
  "pointer-events-none block h-[98%] w-[98%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.85]"

/** @type {Record<string, { badgeSrc?: string, badgeClass?: string }>} */
export const INGAME_PLAYER_STATUS_VISUALS = {
  [INGAME_PLAYER_STATUS.ALIVE]: {},
  [INGAME_PLAYER_STATUS.DEAD]: {
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.dead,
    badgeClass: INGAME_PLAYER_STATUS_DEAD_BADGE_CLASS,
  },
  [INGAME_PLAYER_STATUS.DISCONNECTED]: {
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.disconnected,
  },
}
