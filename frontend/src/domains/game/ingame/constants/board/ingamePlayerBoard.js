/**
 * 인게임 플레이어 보드·링 좌표 엔진.
 *
 * 좌표 데이터는 ingamePlayerLayouts.js — zone 프로필·resolve·style 빌드는 이 파일.
 */

import {
  INGAME_PLAYER_LAYOUT_10,
  INGAME_PLAYER_LAYOUTS_BY_COUNT,
} from "./ingamePlayerLayouts.js"

export {
  INGAME_PLAYER_LAYOUT_10,
  INGAME_PLAYER_LAYOUTS_BY_COUNT,
} from "./ingamePlayerLayouts.js"

/**
 * 레이아웃 확인용 플레이어 수 (4~10).
 * 추후 game setup max-players / ingame store 값으로 교체.
 */
export const INGAME_PREVIEW_PLAYER_COUNT = 10

/** InGamePlayerBoard — 전체 화면 슬롯 레이어 */
export const INGAME_PLAYER_BOARD_POSITION_CLASS =
  "absolute inset-0 z-10 pointer-events-none [perspective:1200px]"

/** 링 슬롯 기본 너비 — scale transform과 별도 (×1.3) */
export const INGAME_PLAYER_SLOT_BASE_WIDTH =
  "clamp(6.2rem, 13.65vw, 9.75rem)"

/**
 * zone별 transform 기본값.
 * 새 인원수 세트 추가 시 ingamePlayerLayouts.js에 좌표 + zone만 넣으면 됩니다.
 */
export const INGAME_PLAYER_SLOT_ZONES = {
  /** 상단 — 뒤 벽에 기대어 선 카드 (rotateX는 derive) */
  top: {
    transformOrigin: "50% 100%",
    scale: 0.94,
    zIndex: 10,
    skewX: 0,
    skewY: 0,
  },
  /** 좌·우 측면 */
  side: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
  /** 하단 바깥 */
  bottom: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1.02,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
  /** 하단 중앙 (채팅 근처) */
  bottomCenter: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1.04,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
}

/** zone + left/top 기준 자동 보정 (슬롯에 명시값 없을 때만 적용) */
function deriveInGamePlayerSlotTransform(zone, left) {
  if (zone === "top") {
    const derived = {}
    if (Math.abs(left - 50) >= 28) {
      derived.rotateX = -11
    } else {
      derived.rotateX = -13
    }
    return derived
  }
  return {}
}

/**
 * 슬롯 정의 → 렌더용 preset.
 * @param {{ left: number, top: number, zone: string, rotate?: number, scale?: number, rotateX?: number, transformOrigin?: string, zIndex?: number, skewX?: number, skewY?: number }} slot
 */
export function resolveInGamePlayerSlotPreset(slot) {
  const { zone, left, top, ...overrides } = slot
  const profile = INGAME_PLAYER_SLOT_ZONES[zone] ?? INGAME_PLAYER_SLOT_ZONES.bottom
  const derived = deriveInGamePlayerSlotTransform(zone, left)

  return {
    left,
    top,
    rotate: 0,
    rotateX: 0,
    ...profile,
    ...derived,
    ...overrides,
  }
}

/** @deprecated resolve된 preset — 디버그·스냅샷용 */
export const INGAME_PLAYER_SLOT_PRESETS_10 =
  INGAME_PLAYER_LAYOUT_10.map(resolveInGamePlayerSlotPreset)

/** playerCount에 맞는 preset 배열 */
export function getInGamePlayerSlotPresets(
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
) {
  const layout =
    INGAME_PLAYER_LAYOUTS_BY_COUNT[playerCount] ??
    INGAME_PLAYER_LAYOUT_10.slice(0, playerCount)

  return layout.map(resolveInGamePlayerSlotPreset)
}

/** 링 슬롯 absolute style — left/top % + scale·rotate·rotateX·skew */
export function buildInGamePlayerSlotStyle(preset) {
  const {
    left,
    top,
    scale,
    rotate,
    rotateX = 0,
    skewX = 0,
    skewY = 0,
    transformOrigin = "center center",
    zIndex = 10,
  } = preset

  return {
    left: `${left}%`,
    top: `${top}%`,
    zIndex,
    width: INGAME_PLAYER_SLOT_BASE_WIDTH,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg) rotateX(${rotateX}deg) skew(${skewX}deg, ${skewY}deg)`,
    transformOrigin,
    transformStyle: "preserve-3d",
  }
}
