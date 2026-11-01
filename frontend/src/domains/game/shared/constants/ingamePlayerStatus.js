// 플레이어 생존 상태 값과 상태 배지·초상화 어둡게 하기 모양
// ingame 보드·투표 대상·미리보기와 result 결과 화면 가공이 씀
export const INGAME_PLAYER_STATUS = {
  ALIVE: "alive",
  DEAD: "dead",
  DISCONNECTED: "disconnected",
}

export const INGAME_PREVIEW_PLAYER_STATUS_BY_SLOT = {
  0: INGAME_PLAYER_STATUS.DEAD,
  1: INGAME_PLAYER_STATUS.DISCONNECTED,
  3: INGAME_PLAYER_STATUS.DEAD,
  6: INGAME_PLAYER_STATUS.DEAD,
  8: INGAME_PLAYER_STATUS.DEAD,
}

export function getPreviewPlayerStatus(slotIndex) {
  return (
    INGAME_PREVIEW_PLAYER_STATUS_BY_SLOT[slotIndex] ??
    INGAME_PLAYER_STATUS.ALIVE
  )
}

export function isInGamePlayerStatusActive(status) {
  return status === INGAME_PLAYER_STATUS.ALIVE
}

export const INGAME_PLAYER_STATUS_ASSETS = {
  dead: "/frame/ingame-status/게임사망상태.png",
  disconnected: "/frame/ingame-status/연결끊김상태.png",
}

export const INGAME_PLAYER_STATUS_OVERLAY_INSET = {
  top: "9%",
  bottom: "21%",
  left: "10%",
  right: "10%",
}

export const INGAME_PLAYER_STATUS_BADGE_CLASS =
  "pointer-events-none block h-[86%] w-[86%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.35]"

export const INGAME_PLAYER_STATUS_DEAD_BADGE_CLASS =
  "pointer-events-none block h-[98%] w-[98%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.85]"

export const INGAME_PLAYER_STATUS_PORTRAIT_DIM_CLASS =
  "pointer-events-none absolute z-[2] bg-black/45"

export const INGAME_PLAYER_STATUS_VISUALS = {
  [INGAME_PLAYER_STATUS.ALIVE]: {},
  [INGAME_PLAYER_STATUS.DEAD]: {
    portraitDim: true,
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.dead,
    badgeClass: INGAME_PLAYER_STATUS_DEAD_BADGE_CLASS,
  },
  [INGAME_PLAYER_STATUS.DISCONNECTED]: {
    portraitDim: true,
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.disconnected,
  },
}
