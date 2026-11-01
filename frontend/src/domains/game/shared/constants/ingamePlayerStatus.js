// 플레이어 생존 상태 값과 상태 배지·초상화 어둡게 하기 모양
// ingame 보드·투표 대상·미리보기와 result 결과 화면 가공이 씀

// 생존 상태 값
export const INGAME_PLAYER_STATUS = {
  ALIVE: "alive",
  DEAD: "dead",
  DISCONNECTED: "disconnected",
}

// 미리보기 화면에서 자리별로 보일 상태 (나머지는 생존)
export const PREVIEW_PLAYER_STATUS_BY_SLOT = {
  0: INGAME_PLAYER_STATUS.DEAD,
  1: INGAME_PLAYER_STATUS.DISCONNECTED,
  3: INGAME_PLAYER_STATUS.DEAD,
  6: INGAME_PLAYER_STATUS.DEAD,
  8: INGAME_PLAYER_STATUS.DEAD,
}

// 미리보기 자리 상태
export function getPreviewPlayerStatus(slotIndex) {
  return (
    PREVIEW_PLAYER_STATUS_BY_SLOT[slotIndex] ??
    INGAME_PLAYER_STATUS.ALIVE
  )
}

// 살아 있는 상태인지
export function isStatusActive(status) {
  return status === INGAME_PLAYER_STATUS.ALIVE
}

// 상태 배지 그림
export const INGAME_PLAYER_STATUS_ASSETS = {
  dead: "/frame/ingame-status/게임사망상태.png",
  disconnected: "/frame/ingame-status/연결끊김상태.png",
}

// 배지 자리 (초상화 틀 안쪽)
export const OVERLAY_INSET = {
  top: "9%",
  bottom: "21%",
  left: "10%",
  right: "10%",
}

// 배지 모양 (죽음 배지는 더 크게)
export const BADGE_CLASS =
  "pointer-events-none block h-[86%] w-[86%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.35]"

export const DEAD_BADGE_CLASS =
  "pointer-events-none block h-[98%] w-[98%] shrink-0 select-none object-contain object-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] scale-[1.85]"

// 초상화 어둡게 덮는 막
export const PORTRAIT_DIM_CLASS =
  "pointer-events-none absolute z-[2] bg-black/45"

// 상태별 보이는 모양 (생존은 없음)
export const STATUS_VISUALS = {
  [INGAME_PLAYER_STATUS.ALIVE]: {},
  [INGAME_PLAYER_STATUS.DEAD]: {
    portraitDim: true,
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.dead,
    badgeClass: DEAD_BADGE_CLASS,
  },
  [INGAME_PLAYER_STATUS.DISCONNECTED]: {
    portraitDim: true,
    badgeSrc: INGAME_PLAYER_STATUS_ASSETS.disconnected,
  },
}
